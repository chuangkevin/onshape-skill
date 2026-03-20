import { Router } from 'express';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { runAnalysisPipeline } from '../services/analyze.js';
import { detectEdges } from '../services/opencv.js';
import { runAnalysisStream } from '../services/analyzeStream.js';
import { runAutoAnalysis } from '../services/autoAnalyze.js';
import { UPLOAD_DIR } from './photos.js';

const router = Router();

// POST /api/projects/:id/analyze
router.post('/:id/analyze', async (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const photos = db.prepare(
    'SELECT * FROM photos WHERE project_id = ?'
  ).all(req.params.id);

  if (photos.length === 0) {
    res.status(400).json({ error: 'No photos in project' });
    return;
  }

  try {
    const result = await runAnalysisPipeline(parseInt(req.params.id));
    res.json({
      status: 'complete',
      project_id: req.params.id,
      result,
    });
  } catch (err: any) {
    console.error('Analysis pipeline error:', err);
    res.status(500).json({
      status: 'error',
      error: err.message || 'Analysis failed',
    });
  }
});

// GET /api/projects/:id/analyze-stream
router.get('/:id/analyze-stream', async (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const photos = db.prepare(
    'SELECT * FROM photos WHERE project_id = ?'
  ).all(req.params.id);

  if (photos.length === 0) {
    res.status(400).json({ error: 'No photos in project' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Handle client disconnect
  req.on('close', () => {
    res.end();
  });

  await runAnalysisStream(res, parseInt(req.params.id));
});

// GET /api/projects/:projectId/photos/:photoId/auto-analyze (SSE - must be GET for EventSource)
router.get('/:projectId/photos/:photoId/auto-analyze', async (req, res) => {
  const db = getDb();
  const photo: any = db.prepare(
    'SELECT * FROM photos WHERE id = ? AND project_id = ?'
  ).get(req.params.photoId, req.params.projectId);

  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Handle client disconnect
  req.on('close', () => {
    res.end();
  });

  await runAutoAnalysis(res, parseInt(req.params.projectId), photo.id);
});

// POST /api/projects/:projectId/photos/:photoId/auto-contour
router.post('/:projectId/photos/:photoId/auto-contour', async (req, res) => {
  const db = getDb();
  const photo: any = db.prepare(
    'SELECT * FROM photos WHERE id = ? AND project_id = ?'
  ).get(req.params.photoId, req.params.projectId);

  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  const imagePath = resolve(UPLOAD_DIR, photo.filename);
  const roi = req.body.roi; // optional

  try {
    const result = await detectEdges(imagePath, roi, 0.003);
    res.json(result);
  } catch (err: any) {
    console.error('Auto-contour error:', err);
    res.status(500).json({ error: err.message, contours: [], circles: [] });
  }
});

// GET /api/projects/:id/results
router.get('/:id/results', (req, res) => {
  const db = getDb();
  const results = db.prepare(
    'SELECT * FROM analysis_results WHERE project_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(results);
});

export default router;
