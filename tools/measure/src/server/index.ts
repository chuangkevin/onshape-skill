import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
const clientDir = resolve(__dirname, '../client');
app.use(express.static(clientDir));

app.listen(PORT, () => {
  console.log(`Photo Measure server running on http://localhost:${PORT}`);
});

export { app };
