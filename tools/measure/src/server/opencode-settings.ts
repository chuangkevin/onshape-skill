import { getDb } from './db.js';

export function initOpenCodeSettingsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  const db = getDb();
  if (value === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  } else {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value);
  }
}

export function getOpenCodeServers(): string[] {
  const raw = getSetting('opencode_servers');
  if (!raw) {
    const env = process.env.OPENCODE_SERVER_URL;
    return env ? [env] : [];
  }
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getOpenCodeModel(): string {
  const saved = getSetting('opencode_text_model');
  if (saved && saved.trim()) return saved.trim();
  return process.env.OPENCODE_MODEL ?? 'opencode/deepseek-v4-flash-free';
}
