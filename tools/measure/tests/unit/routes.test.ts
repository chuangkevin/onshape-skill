import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// We test routes by creating a mini Express app with test DB
// instead of importing the full server (which starts listening)

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock db module - create in-memory DB and override getDb
import { createTestDb, getDb } from '../../src/server/db.js';
import { invalidateKeyCache } from '../../src/server/geminiKeys.js';

let db: Database.Database;
let app: express.Express;

// Since routes import getDb(), we need to set up the DB before importing routes
// We'll test the API contract via the full app import approach

describe('API Routes', () => {
  const testKeys = [
    'AIzaSyRouteTestKey000000000000000000001',
    'AIzaSyRouteTestKey000000000000000000002',
    'AIzaSyRouteTestKey000000000000000000003',
    'AIzaSyRouteTestKey000000000000000000004',
    'AIzaSyRouteTestKey000000000000000000005',
  ].join(',');

  afterAll(() => {
    const db = getDb();
    db.prepare("DELETE FROM projects WHERE name IN ('Test Project', 'Listed Project', 'To Delete')").run();
  });

  beforeEach(async () => {
    process.env.GEMINI_API_KEYS = testKeys;
    invalidateKeyCache();
    // Create a fresh express app for each test
    app = express();
    app.use(express.json());

    // We'll test by hitting the actual endpoints
    // Import routes dynamically
    const { default: projectsRouter } = await import('../../src/server/routes/projects.js');
    const { default: keysRouter } = await import('../../src/server/routes/keys.js');

    app.use('/api/projects', projectsRouter);
    app.use('/api/keys', keysRouter);
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEYS;
    invalidateKeyCache();
  });

  describe('POST /api/projects', () => {
    it('creates a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test Project', description: 'testing' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Project');
      expect(res.body.id).toBeDefined();
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ description: 'no name' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/projects', () => {
    it('lists projects', async () => {
      // Create one first
      await request(app)
        .post('/api/projects')
        .send({ name: 'Listed Project' });

      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('deletes a project', async () => {
      const created = await request(app)
        .post('/api/projects')
        .send({ name: 'To Delete' });

      const res = await request(app).delete(`/api/projects/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app).delete('/api/projects/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/keys', () => {
    it('lists API keys with stats', async () => {
      const res = await request(app).get('/api/keys');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(5);
      expect(res.body[0].suffix).toHaveLength(4);
    });
  });
});
