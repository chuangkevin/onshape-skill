import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// POST /api/projects/:id/analyze — stub, will be implemented in Phase 10
router.post('/:id/analyze', (req, res) => {
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

  // Stub: return placeholder
  res.json({
    status: 'pending',
    message: 'AI analysis pipeline not yet implemented',
    project_id: req.params.id,
    photo_count: photos.length,
  });
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
