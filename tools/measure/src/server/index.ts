import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { getDb } from './db.js';
import projectsRouter from './routes/projects.js';
import photosRouter from './routes/photos.js';
import keysRouter from './routes/keys.js';
import analyzeRouter from './routes/analyze.js';
import exportRouter from './routes/exportRoute.js';
import featurescriptRouter from './routes/featurescript.js';
import { UPLOAD_DIR } from './routes/photos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const CLIENT_SRC = resolve(PROJECT_ROOT, 'src/client');
const CLIENT_DIST = resolve(PROJECT_ROOT, 'dist/client');
const isDev = process.env.NODE_ENV !== 'production';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

app.use(express.json());

// Initialize database
getDb();

// API routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/projects', projectsRouter);
app.use('/api/projects', photosRouter);
app.use('/api/projects', analyzeRouter);
app.use('/api/projects', exportRouter);
app.use('/api/keys', keysRouter);
app.use('/api/generate-featurescript', featurescriptRouter);

// Serve uploaded photos
app.use('/uploads', express.static(UPLOAD_DIR));

if (isDev) {
  // Development: Use Vite as middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: CLIENT_SRC,
    server: { middlewareMode: true },
    resolve: {
      alias: {
        '@shared': resolve(PROJECT_ROOT, 'src/shared'),
      },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  // Production: Serve built files
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    const indexPath = resolve(CLIENT_DIST, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Build not found. Run: npm run build');
    }
  });
}

app.listen(PORT, () => {
  console.log(`照片量測工具運行中：http://localhost:${PORT}`);
  console.log(`模式：${isDev ? '開發' : '正式'}`);
});

export { app };
