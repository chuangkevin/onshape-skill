import { resolve } from 'path';
import type { Response } from 'express';
import { getDb } from '../db.js';
import { detectRuler } from './ruler.js';
import { detectEdges } from './opencv.js';
import { extractLabels } from './search.js';
import { UPLOAD_DIR } from '../routes/photos.js';

type StepId = 'ruler' | 'contour' | 'labels' | 'complete';
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
  // 30-second timeout
  const timeout = setTimeout(() => {
    emitError(res, 'Auto-analysis timed out after 30 seconds');
  }, 30_000);

  try {
    const db = getDb();

    const photo: any = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
    if (!photo) {
      clearTimeout(timeout);
      emitError(res, 'Photo not found');
      return;
    }

    const imagePath = resolve(UPLOAD_DIR, photo.filename);

    // === Parallel group: ruler, contour, labels ===
    emit(res, 'ruler', 'running');
    emit(res, 'contour', 'running');
    emit(res, 'labels', 'running');

    const [rulerResult, contourResult, labelResult] = await Promise.all([
      detectRuler(imagePath, projectId)
        .then((r) => { emit(res, 'ruler', 'done', r); return r; })
        .catch((e) => { emit(res, 'ruler', 'error', { error: e.message }); return null; }),
      detectEdges(imagePath, undefined, 0.003)
        .then((r) => { emit(res, 'contour', 'done', r); return r; })
        .catch((e) => { emit(res, 'contour', 'error', { error: e.message }); return null; }),
      extractLabels([imagePath], projectId)
        .then((r) => { emit(res, 'labels', 'done', r); return r; })
        .catch((e) => { emit(res, 'labels', 'error', { error: e.message }); return null; }),
    ]);

    // Store results in analysis_results table
    const combined = { ruler: rulerResult, contour: contourResult, labels: labelResult };
    db.prepare(`
      INSERT INTO analysis_results (project_id, photo_id, result_type, raw_response, parsed_data)
      VALUES (?, ?, 'auto_analyze', ?, ?)
    `).run(
      projectId,
      photoId,
      JSON.stringify(combined),
      JSON.stringify(combined),
    );

    // Send complete event
    emit(res, 'complete', 'done', combined);
    if (!res.writableEnded) {
      res.end();
    }
  } catch (err: any) {
    emitError(res, err.message || 'Auto-analysis failed');
  } finally {
    clearTimeout(timeout);
  }
}
