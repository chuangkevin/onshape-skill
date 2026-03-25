import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import type { Response } from 'express';
import { getDb } from '../db.js';
import { detectRuler, detectObjectBBox } from './ruler.js';
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

/**
 * Quality gate for contour results.
 * Returns false (reject) if:
 *   - Fewer than 4 points
 *   - Contour bounding rect covers >85% of the FULL IMAGE (background/noise)
 *   - Contour covers <50% of the Gemini bbox area (incomplete — FastSAM missed part of object)
 */
function isContourQualityOk(
  contours: Array<{ contour_px: Array<{ x: number; y: number }> }>,
  bboxResult: { found?: boolean; x?: number; y?: number; width?: number; height?: number } | null | unknown,
  imageWidth: number,
  imageHeight: number,
): boolean {
  if (!contours || contours.length === 0) return false;
  const pts = contours[0].contour_px;
  if (!pts || pts.length < 4) {
    console.log(`[quality] Rejected: only ${pts?.length ?? 0} points (min 4)`);
    return false;
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cW = Math.max(...xs) - Math.min(...xs);
  const cH = Math.max(...ys) - Math.min(...ys);

  if (imageWidth > 0 && imageHeight > 0) {
    const ratio = (cW * cH) / (imageWidth * imageHeight);
    if (ratio > 0.85) {
      console.log(`[quality] Rejected: contour covers ${(ratio * 100).toFixed(0)}% of image (max 85%)`);
      return false;
    }
  }

  // If Gemini bbox is available, contour must cover ≥50% of the bbox area.
  // A smaller ratio means FastSAM only found part of the object — force Gemini fallback.
  const bbox = bboxResult as { found?: boolean; x?: number; y?: number; width?: number; height?: number } | null;
  if (bbox?.found && bbox.width && bbox.height && bbox.width > 0 && bbox.height > 0) {
    const bboxArea = bbox.width * bbox.height;
    const coverageRatio = (cW * cH) / bboxArea;
    if (coverageRatio < 0.50) {
      console.log(`[quality] Rejected: contour bbox covers only ${(coverageRatio * 100).toFixed(0)}% of detected object bbox (min 50%)`);
      return false;
    }
  }

  return true;
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
  userRoi?: { x1: number; y1: number; x2: number; y2: number },
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

    // Phase 2: Two-layer fallback contour detection
    // Layer 0: FastSAM (fast, local, pixel-accurate) with optional bbox ROI
    // Layer 1: Gemini polygon (semantic fallback, bbox hint in prompt)
    // Both layers pass through a quality gate before emitting contour-update.
    emit(res, 'contour', 'running');

    let contourResult: any = null;

    // Derive image dimensions for quality gate.
    // FastSAM returns image_size; fall back to bbox edge as a conservative estimate.
    let imgW = bboxResult?.found ? (bboxResult.x! + bboxResult.width!) : 0;
    let imgH = bboxResult?.found ? (bboxResult.y! + bboxResult.height!) : 0;

    // Layer 0: FastSAM segmentation
    try {
      // User-drawn ROI takes priority over Gemini bbox.
      // If no user ROI, add 10% padding around the Gemini bbox so features like
      // bottom connector brackets are included in the crop.
      const fastSamRoi = userRoi
        ? userRoi
        : bboxResult?.found
          ? (() => {
              const padX = Math.round(bboxResult.width! * 0.10);
              const padY = Math.round(bboxResult.height! * 0.10);
              return {
                x1: Math.max(0, bboxResult.x! - padX),
                y1: Math.max(0, bboxResult.y! - padY),
                x2: bboxResult.x! + bboxResult.width! + padX,
                y2: bboxResult.y! + bboxResult.height! + padY,
              };
            })()
          : undefined;
      const fastSamResult = await detectContourWithFastSAM(imagePath, fastSamRoi);

      // Use FastSAM's reported image size when available
      if (fastSamResult.image_size) {
        imgW = fastSamResult.image_size.width;
        imgH = fastSamResult.image_size.height;
      }

      if (fastSamResult.found && fastSamResult.contours.length > 0) {
        if (isContourQualityOk(fastSamResult.contours, bboxResult, imgW, imgH)) {
          contourResult = { ...fastSamResult, method: 'fastsam' };
          console.log(`[autoAnalyze] Contour via FastSAM (${fastSamResult.contours.length} contour(s))`);
          emitContourUpdate(res, 'fastsam', fastSamResult.contours);
          // Launch Phase 2 web calibration asynchronously (fire-and-forget)
          triggerWebCalibration(res, imagePath, labelResult, projectId);
        } else {
          console.warn('[autoAnalyze] FastSAM contour failed quality gate, trying Gemini');
        }
      }
    } catch (e: any) {
      console.warn('[autoAnalyze] FastSAM failed, trying Gemini:', e.message);
    }

    // Layer 1: Gemini contour (semantic fallback, bbox hint embedded in prompt)
    if (!contourResult) {
      try {
        const geminiRoi = bboxResult?.found
          ? { x: bboxResult.x!, y: bboxResult.y!, width: bboxResult.width!, height: bboxResult.height! }
          : undefined;
        const geminiContour = await detectContourWithGemini(imagePath, projectId, geminiRoi);
        if (geminiContour.found && geminiContour.contours.length > 0) {
          if (isContourQualityOk(geminiContour.contours, bboxResult, imgW, imgH)) {
            contourResult = { ...geminiContour, method: 'gemini' };
            console.log(`[autoAnalyze] Contour via Gemini (${geminiContour.contours.length} contour(s))`);
            emitContourUpdate(res, 'gemini', geminiContour.contours);
          } else {
            console.warn('[autoAnalyze] Gemini contour failed quality gate');
          }
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
