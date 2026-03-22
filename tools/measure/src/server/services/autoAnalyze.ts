import { resolve } from 'path';
import type { Response } from 'express';
import { getDb } from '../db.js';
import { detectRuler, detectObjectBBox } from './ruler.js';
import { detectEdges } from './opencv.js';
import { detectContourWithGemini } from './contour.js';
import { extractLabels } from './search.js';
import { UPLOAD_DIR } from '../routes/photos.js';

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
    // Layer 1: Gemini polygon → Layer 2: OpenCV edge → Layer 3: empty result
    emit(res, 'contour', 'running');

    let contourResult: any = null;
    let contourMethod: 'gemini' | 'opencv' | 'none' = 'none';

    // Layer 1: Gemini contour detection
    try {
      const geminiContour = await detectContourWithGemini(imagePath, projectId);
      if (geminiContour.found && geminiContour.contours.length > 0) {
        contourMethod = 'gemini';
        contourResult = { ...geminiContour, method: 'gemini' };
        console.log(`[autoAnalyze] Contour detected via Gemini (${geminiContour.contours.length} contour(s))`);
        emit(res, 'contour', 'done', contourResult);
      }
    } catch (e: any) {
      console.warn('[autoAnalyze] Gemini contour failed, falling back to OpenCV:', e.message);
    }

    // Layer 2: OpenCV edge detection (fallback)
    if (!contourResult) {
      try {
        const roi = bboxResult?.found
          ? { x: bboxResult.x!, y: bboxResult.y!, width: bboxResult.width!, height: bboxResult.height! }
          : undefined;
        const opencvResult = await detectEdges(imagePath, roi, 0.003);
        if (opencvResult && opencvResult.contours && opencvResult.contours.length > 0) {
          contourMethod = 'opencv';
          contourResult = { ...opencvResult, method: 'opencv' };
          console.log(`[autoAnalyze] Contour detected via OpenCV (${opencvResult.contours.length} contour(s))`);
          emit(res, 'contour', 'done', contourResult);
        }
      } catch (e: any) {
        console.warn('[autoAnalyze] OpenCV contour also failed:', e.message);
      }
    }

    // Layer 3: No contour detected
    if (!contourResult) {
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
