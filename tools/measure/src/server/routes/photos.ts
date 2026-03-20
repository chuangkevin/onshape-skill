import { Router } from 'express';
import multer from 'multer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { getDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolve(__dirname, '../../../data/uploads');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${unique}.${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();

// GET /api/projects/:projectId/photos
router.get('/:projectId/photos', (req, res) => {
  const db = getDb();
  const photos = db.prepare(
    'SELECT * FROM photos WHERE project_id = ? ORDER BY created_at'
  ).all(req.params.projectId);
  res.json(photos);
});

// POST /api/projects/:projectId/photos
router.post('/:projectId/photos', upload.array('photos', 20), (req, res) => {
  const db = getDb();
  const projectId = req.params.projectId;

  // Verify project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const insertStmt = db.prepare(`
    INSERT INTO photos (project_id, filename, original_name, angle)
    VALUES (?, ?, ?, 'top')
  `);

  const photos = files.map((file) => {
    const result = insertStmt.run(projectId, file.filename, file.originalname);
    return db.prepare('SELECT * FROM photos WHERE id = ?').get(result.lastInsertRowid);
  });

  // Update project timestamp
  db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?').run(projectId);

  res.status(201).json(photos);
});

// PATCH /api/projects/:projectId/photos/:photoId
router.patch('/:projectId/photos/:photoId', (req, res) => {
  const db = getDb();
  const { angle, scale_data } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (angle) {
    updates.push('angle = ?');
    values.push(angle);
  }
  if (scale_data !== undefined) {
    updates.push('scale_data = ?');
    values.push(typeof scale_data === 'string' ? scale_data : JSON.stringify(scale_data));
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No update fields provided' });
    return;
  }

  values.push(req.params.photoId, req.params.projectId);
  const result = db.prepare(
    `UPDATE photos SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`
  ).run(...values);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.photoId);
  res.json(photo);
});

// PATCH /api/projects/:projectId/apply-scale
router.patch('/:projectId/apply-scale', (req, res) => {
  const db = getDb();
  const { scale_data } = req.body;

  if (!scale_data) {
    res.status(400).json({ error: 'scale_data is required' });
    return;
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const scaleStr = typeof scale_data === 'string' ? scale_data : JSON.stringify(scale_data);
  const result = db.prepare(
    'UPDATE photos SET scale_data = ? WHERE project_id = ?'
  ).run(scaleStr, req.params.projectId);

  res.json({ updated: result.changes });
});

// DELETE /api/projects/:projectId/photos/:photoId
router.delete('/:projectId/photos/:photoId', (req, res) => {
  const db = getDb();
  const photo: any = db.prepare(
    'SELECT * FROM photos WHERE id = ? AND project_id = ?'
  ).get(req.params.photoId, req.params.projectId);

  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  // Delete file from disk
  const filePath = resolve(UPLOAD_DIR, photo.filename);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  res.json({ deleted: true });
});

export { router as default, UPLOAD_DIR };
