import { Router } from 'express';
import {
  addApiKey,
  removeApiKey,
  getKeyList,
} from '../geminiKeys.js';

const router = Router();

// GET /api/keys
router.get('/', (_req, res) => {
  const list = getKeyList();
  res.json(list);
});

// POST /api/keys
router.post('/', (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'key is required' });
    return;
  }
  addApiKey(key);
  res.status(201).json({ added: true, suffix: key.slice(-4) });
});

// DELETE /api/keys/:suffix
router.delete('/:suffix', (req, res) => {
  const removed = removeApiKey(req.params.suffix);
  if (!removed) {
    res.status(404).json({ error: 'Key not found' });
    return;
  }
  res.json({ deleted: true });
});

export default router;
