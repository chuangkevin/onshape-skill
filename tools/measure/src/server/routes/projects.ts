import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// GET /api/projects
router.get('/', (_req, res) => {
  const db = getDb();
  const projects = db.prepare(
    'SELECT * FROM projects ORDER BY updated_at DESC'
  ).all();
  res.json(projects);
});

// POST /api/projects
router.post('/', (req, res) => {
  const db = getDb();
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const result = db.prepare(
    'INSERT INTO projects (name, description) VALUES (?, ?)'
  ).run(name, description ?? '');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ deleted: true });
});

export default router;
