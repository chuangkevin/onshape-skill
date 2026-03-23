import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import type { Response } from 'express';
import { getDb } from '../db.js';
import { detectRuler, detectObjectBBox } from './ruler.js';
import { detectEdges } from './opencv.js';
import { detectContourWithFastSAM, detectContourWithGemini } from './contour.js';
import { extractLabels } from './search.js';
import { UPLOAD_DIR } from '../routes/photos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_CALIBRATE_SCRIPT = resolve(__dirname, '../python/web_calibrate.py');
const IS_WINDOWS = process.platform === 'win32';

type StepId = 'ruler' | 'bbox' | 'contour' | 'labels' | 'complete';
type StepStatus = 'running' | 'done' | 'error';

function emit(res: Response, step: StepId, status: StepStatus, result?: unknown): void {
  if (res.writableEnded) return;
  const data = JSON.stringify({ step, status, ...(result !== undefined ? { result } : {}) });
  res.write(`event: step\ndata: ${data}\n\n`);
}

function emitError(res: Response, message: string): void {
  if (res.writableEnded) return;
  res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  res.end();
}

function emitContourUpdate(
  res: Response,
  source: string,
  contours: unknown[],
): void {
  if (res.writableEnded) return;
  res.write(`event: contour-update\ndata: ${JSON.stringify({ source, contours })}\n\n`);
}

/** Extract model ID patterns like L390X45S from label strings */
function extractModelId(labelResult: any): string | null {
  if (!labelResult) return null;
  const text = JSON.stringify(labelResult);
  const match = text.match(/L\d+[A-Z]\d+[A-Z]\d+/);
  return match ? match[0] : null;
}

/**
 * Asynchronously run web_calibrate.py for Phase 2 calibration.
 * Results are emitted via SSE as they arrive. Caches per model_id with 24 h TTL.
 */
function triggerWebCalibration(
  res: Response,
  imagePath: string,
  labelResult: any,
  projectId: number,
): void {
  const modelId = extractModelId(labelResult);
  if (!modelId) {
    console.log('[webCalib] No model ID found in labels, skipping Phase 2');
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEYS?.split(',')[0] ?? '';

  // Check cache first
  const db = getDb();
  const ttl = 86400; // 24 h in seconds
  const cached: any = db
    .prepare(
      `SELECT contours_json, created_at FROM web_calibration_cache
       WHERE model_id = ? AND (unixepoch() - created_at) < ?`,
    )
    .get(modelId, ttl);

  if (cached) {
    console.log(`[webCalib] Cache hit for ${modelId}, emitting cached contours`);
    try {
      const contours = JSON.parse(cached.contours_json);
      emitContourUpdate(res, 'web-calibrated', contours);
    } catch {
      console.error('[webCalib] Failed to parse cached contours');
    }
    return;
  }

  if (!existsSync(WEB_CALIBRATE_SCRIPT)) {
    console.warn('[webCalib] web_calibrate.py not found at', WEB_CALIBRATE_SCRIPT);
    return;
  }

  const pythonCmd = process.env.PYTHON_PATH ?? (IS_WINDOWS ? 'python' : 'python3');
  const args = [WEB_CALIBRATE_SCRIPT, '--model-id', modelId, '--gemini-key', geminiKey];
  const safeArgs = IS_WINDOWS
    ? args.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a))
    : args;

  const proc = spawn(pythonCmd, safeArgs, {
    shell: true,
    windowsHide: true,
    env: process.env,
  });

  let buffer = '';
  let calibratedContours: unknown[] | null = null;

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.event === 'contour-update' && Array.isArray(msg.contours)) {
          calibratedContours = msg.contours;
          emitContourUpdate(res, 'web-calibrated', msg.contours);
          console.log(`[webCalib] Phase 2 contour-update for ${modelId}: ${msg.contours.length} contour(s)`);
        }
      } catch {
        // ignore non-JSON lines (e.g. debug prints)
      }
    }
  });

  proc.stderr.on('data', (d: Buffer) => {
    console.warn('[webCalib] stderr:', d.toString().trim());
  });

  proc.on('close', (code: number | null) => {
    console.log(`[webCalib] web_calibrate.py exited with code ${code}`);
    if (calibratedContours) {
      try {
        db.prepare(
          `INSERT OR REPLACE INTO web_calibration_cache (model_id, contours_json, created_at)
           VALUES (?, ?, unixepoch())`,
        ).run(modelId, JSON.stringify(calibratedContours));
        console.log(`[webCalib] Cached contours for ${modelId}`);
      } catch (e: any) {
        console.error('[webCalib] Failed to cache contours:', e.message);
      }
    }
  });

  proc.on('error', (e: Error) => {
    console.error('[webCalib] Failed to spawn web_calibrate.py:', e.message);
  });
}

export async function runAutoAnalysis(
  res: Response,
  projectId: number,
  photoId: number,
): Promise<void> {
  const timeout = setTimeout(() => {
    emitError(res, 'Auto-analysis timed out after 60 seconds');
  }, 60_000);

  try {
    const db = getDb();
    const photo: any = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
    if (!photo) {
      clearTimeout(timeout);
      emitError(res, 'Photo not found');
      return;
    }

    const imagePath = resolve(UPLOAD_DIR, photo.filename);

    // Phase 1: Parallel — ruler + bbox + labels (all use Gemini, different keys)
    emit(res, 'ruler', 'running');
    emit(res, 'bbox', 'running');
    emit(res, 'labels', 'running');

    const [rulerResult, bboxResult, labelResult] = await Promise.all([
      detectRuler(imagePath, projectId)
        .then((r) => { emit(res, 'ruler', 'done', r); return r; })
        .catch((e) => { emit(res, 'ruler', 'error', { error: e.message }); return null; }),
      detectObjectBBox(imagePath, projectId)
        .then((r) => { emit(res, 'bbox', 'done', r); return r; })
        .catch((e) => { emit(res, 'bbox', 'error', { error: e.message }); return null; }),
      extractLabels([imagePath], projectId)
        .then((r) => { emit(res, 'labels', 'done', r); return r; })
        .catch((e) => { emit(res, 'labels', 'error', { error: e.message }); return null; }),
    ]);

    // Phase 2: Three-layer fallback contour detection
    // Layer 0: FastSAM (fast, local) → Layer 1: OpenCV + bbox ROI → Layer 2: Gemini polygon (rough)
    emit(res, 'contour', 'running');

    let contourResult: any = null;

    // Layer 0: FastSAM segmentation
    try {
      const fastSamRoi = bboxResult?.found
        ? { x1: bboxResult.x!, y1: bboxResult.y!, x2: bboxResult.x! + bboxResult.width!, y2: bboxResult.y! + bboxResult.height! }
        : undefined;
      const fastSamResult = await detectContourWithFastSAM(imagePath, fastSamRoi);
      if (fastSamResult.found && fastSamResult.contours.length > 0) {
        contourResult = { ...fastSamResult, method: 'fastsam' };
        console.log(`[autoAnalyze] Contour via FastSAM (${fastSamResult.contours.length} contour(s))`);
        emitContourUpdate(res, 'fastsam', fastSamResult.contours);
        // Launch Phase 2 web calibration asynchronously (fire-and-forget)
        triggerWebCalibration(res, imagePath, labelResult, projectId);
      }
    } catch (e: any) {
      console.warn('[autoAnalyze] FastSAM failed, trying OpenCV:', e.message);
    }

    // Layer 1: OpenCV edge detection — only run if we have a bbox ROI to constrain the search
    // Without ROI, OpenCV scans the full image and produces unreliable full-frame contours
    if (!contourResult && bboxResult?.found) {
      try {
        const roi = { x: bboxResult.x!, y: bboxResult.y!, width: bboxResult.width!, height: bboxResult.height! };
        const opencvResult = await detectEdges(imagePath, roi, 0.003);
        if (opencvResult?.contours?.length > 0) {
          contourResult = { ...opencvResult, method: 'opencv' };
          console.log(`[autoAnalyze] Contour via OpenCV (${opencvResult.contours.length} contour(s), ROI: ${roi.width}x${roi.height})`);
        }
      } catch (e: any) {
        console.warn('[autoAnalyze] OpenCV failed, trying Gemini:', e.message);
      }
    }

    // Layer 2: Gemini contour (fallback when OpenCV unavailable or returns nothing)
    if (!contourResult) {
      try {
        const geminiContour = await detectContourWithGemini(imagePath, projectId);
        if (geminiContour.found && geminiContour.contours.length > 0) {
          contourResult = { ...geminiContour, method: 'gemini' };
          console.log(`[autoAnalyze] Contour via Gemini (${geminiContour.contours.length} contour(s))`);
        }
      } catch (e: any) {
        console.warn('[autoAnalyze] Gemini contour also failed:', e.message);
      }
    }

    // Emit result
    if (contourResult) {
      emit(res, 'contour', 'done', contourResult);
    } else {
      contourResult = { contours: [], method: 'none' };
      console.log('[autoAnalyze] No contour detected by any method');
      emit(res, 'contour', 'done', contourResult);
    }

    // Store results
    const combined = { ruler: rulerResult, bbox: bboxResult, contour: contourResult, labels: labelResult };
    db.prepare(`
      INSERT INTO analysis_results (project_id, photo_id, result_type, raw_response, parsed_data)
      VALUES (?, ?, 'auto_analyze', ?, ?)
    `).run(projectId, photoId, JSON.stringify(combined), JSON.stringify(combined));

    emit(res, 'complete', 'done', combined);
    if (!res.writableEnded) res.end();
  } catch (err: any) {
    emitError(res, err.message || 'Auto-analysis failed');
  } finally {
    clearTimeout(timeout);
  }
}
