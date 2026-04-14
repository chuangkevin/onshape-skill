import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, '../../data/measure.db');

let db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;
  db = new Database(dbPath ?? DEFAULT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// For testing: create an in-memory database
export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  runMigrations(testDb);
  testDb.prepare(
    "UPDATE settings SET value = ? WHERE key = 'gemini_api_keys' AND value = ''"
  ).run([
    'AIzaSyTestKey0000000000000000000000001',
    'AIzaSyTestKey0000000000000000000000002',
    'AIzaSyTestKey0000000000000000000000003',
    'AIzaSyTestKey0000000000000000000000004',
    'AIzaSyTestKey0000000000000000000000005',
  ].join(','));
  return testDb;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    database.prepare('SELECT name FROM migrations').all()
      .map((r: any) => r.name)
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.name)) {
      database.exec(migration.sql);
      database.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
    }
  }
}

const MIGRATIONS = [
  {
    name: '001_initial_schema',
    sql: `
      -- Key-value settings store
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- API key usage tracking
      CREATE TABLE api_key_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key_suffix TEXT NOT NULL,
        model TEXT NOT NULL,
        call_type TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        project_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_usage_suffix ON api_key_usage(api_key_suffix);
      CREATE INDEX idx_usage_created ON api_key_usage(created_at);

      -- Measurement projects
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Photos within projects
      CREATE TABLE photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        angle TEXT NOT NULL DEFAULT 'top',
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        scale_data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_photos_project ON photos(project_id);

      -- Drawing shapes on photos
      CREATE TABLE drawings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER NOT NULL,
        shape_type TEXT NOT NULL,
        shape_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_drawings_photo ON drawings(photo_id);

      -- Feature annotations
      CREATE TABLE features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER NOT NULL,
        feature_type TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        shape_data TEXT NOT NULL,
        dimension_mm REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_features_photo ON features(photo_id);

      -- AI analysis results
      CREATE TABLE analysis_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        photo_id INTEGER,
        result_type TEXT NOT NULL,
        raw_response TEXT NOT NULL,
        parsed_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_results_project ON analysis_results(project_id);
    `,
  },
  {
    name: '002_seed_gemini_keys',
    sql: `
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('gemini_api_keys', ''),  -- Set via ENV: GEMINI_API_KEYS=key1,key2,key3
        ('gemini_model', 'gemini-2.5-flash');
    `,
  },
  {
    name: '003_cleanup_test_data',
    sql: `
      DELETE FROM photos WHERE project_id IN (SELECT id FROM projects WHERE name IN ('Test Project', 'Listed Project'));
      DELETE FROM projects WHERE name IN ('Test Project', 'Listed Project');
    `,
  },
  {
    name: '004_web_calibration_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS web_calibration_cache (
        model_id TEXT PRIMARY KEY,
        contours_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
  {
    name: '005_video_analysis_jobs',
    sql: `
      -- Video analysis jobs
      CREATE TABLE video_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        video_filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        frame_count INTEGER NOT NULL DEFAULT 0,
        object_type TEXT,
        object_description TEXT,
        features_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_video_jobs_created ON video_jobs(created_at);
    `,
  },
];
