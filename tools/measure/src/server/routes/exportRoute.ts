import { Router } from 'express';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../db.js';

const router = Router();

// POST /api/projects/:id/export
router.post('/:id/export', (req, res) => {
  const db = getDb();
  const project: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Gather all data for export
  const photos = db.prepare('SELECT * FROM photos WHERE project_id = ?').all(req.params.id);
  const results = db.prepare(
    'SELECT * FROM analysis_results WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
  ).all(req.params.id);

  // Build measurement.json structure (stub — fusion engine fills this in Phase 11)
  const measurement = {
    part_name: project.name,
    model_number: null,
    official_specs: {},
    views: [],
    caliper_readings: [],
    confidence: { overall: 'low' as const },
    _meta: {
      project_id: project.id,
      photo_count: photos.length,
      has_analysis: results.length > 0,
      exported_at: new Date().toISOString(),
    },
  };

  // If path specified, save to disk
  const { path: savePath } = req.body;
  if (savePath) {
    const fullPath = resolve(savePath, 'measurement.json');
    writeFileSync(fullPath, JSON.stringify(measurement, null, 2));
    res.json({ saved: true, path: fullPath, measurement });
    return;
  }

  res.json(measurement);
});

export default router;
