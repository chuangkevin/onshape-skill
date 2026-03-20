import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import projectsRouter from './routes/projects.js';
import photosRouter from './routes/photos.js';
import keysRouter from './routes/keys.js';
import analyzeRouter from './routes/analyze.js';
import exportRouter from './routes/exportRoute.js';
import { UPLOAD_DIR } from './routes/photos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize database
getDb();

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects', photosRouter);
app.use('/api/projects', analyzeRouter);
app.use('/api/projects', exportRouter);
app.use('/api/keys', keysRouter);

// Serve uploaded photos
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve static files in production
const clientDir = resolve(__dirname, '../client');
app.use(express.static(clientDir));

app.listen(PORT, () => {
  console.log(`Photo Measure server running on http://localhost:${PORT}`);
});

export { app };
