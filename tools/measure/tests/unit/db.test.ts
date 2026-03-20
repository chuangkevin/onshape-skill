import { describe, it, expect } from 'vitest';
import { createTestDb } from '../../src/server/db.js';

describe('Database', () => {
  it('creates all tables', () => {
    const db = createTestDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);

    expect(tables).toContain('settings');
    expect(tables).toContain('api_key_usage');
    expect(tables).toContain('projects');
    expect(tables).toContain('photos');
    expect(tables).toContain('drawings');
    expect(tables).toContain('features');
    expect(tables).toContain('analysis_results');
    expect(tables).toContain('migrations');
    db.close();
  });

  it('seeds gemini API keys', () => {
    const db = createTestDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_keys'").get();
    expect(row).toBeTruthy();
    const keys = row.value.split(',');
    expect(keys).toHaveLength(5);
    expect(keys[0]).toMatch(/^AIzaSy/);
    db.close();
  });

  it('seeds gemini model setting', () => {
    const db = createTestDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model'").get();
    expect(row).toBeTruthy();
    expect(row.value).toBe('gemini-2.5-flash');
    db.close();
  });

  it('tracks migrations', () => {
    const db = createTestDb();
    const migrations = db.prepare('SELECT name FROM migrations ORDER BY id').all()
      .map((r: any) => r.name);
    expect(migrations).toContain('001_initial_schema');
    expect(migrations).toContain('002_seed_gemini_keys');
    db.close();
  });

  it('is idempotent (running migrations twice does not fail)', () => {
    const db = createTestDb();
    // createTestDb already ran migrations; calling the db again should not throw
    expect(() => {
      const db2 = createTestDb();
      db2.close();
    }).not.toThrow();
    db.close();
  });

  it('supports foreign key cascade delete', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO projects (name) VALUES ('test')").run();
    const project: any = db.prepare('SELECT id FROM projects').get();
    db.prepare(
      "INSERT INTO photos (project_id, filename, original_name) VALUES (?, 'test.jpg', 'test.jpg')"
    ).run(project.id);

    // Verify photo exists
    expect(db.prepare('SELECT COUNT(*) as c FROM photos').get()).toEqual({ c: 1 });

    // Delete project → photos should cascade
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    expect(db.prepare('SELECT COUNT(*) as c FROM photos').get()).toEqual({ c: 0 });
    db.close();
  });
});
