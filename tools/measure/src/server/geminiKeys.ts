import type Database from 'better-sqlite3';
import { getDb } from './db.js';

let cachedKeys: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

let keyIndex = 0;

function loadKeys(db?: Database.Database): string[] {
  const now = Date.now();
  if (cachedKeys && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedKeys;
  }

  const database = db ?? getDb();
  const keySet = new Set<string>();

  // Source 1: ENV variable
  const envKeys = process.env.GEMINI_API_KEYS;
  if (envKeys) {
    for (const k of envKeys.split(',')) {
      const trimmed = k.trim();
      if (trimmed) keySet.add(trimmed);
    }
  }

  // Source 2: DB gemini_api_keys (comma-separated)
  const multiRow: any = database.prepare(
    "SELECT value FROM settings WHERE key = 'gemini_api_keys'"
  ).get();
  if (multiRow?.value) {
    for (const k of multiRow.value.split(',')) {
      const trimmed = k.trim();
      if (trimmed) keySet.add(trimmed);
    }
  }

  // Source 3: DB gemini_api_key (legacy single key)
  const singleRow: any = database.prepare(
    "SELECT value FROM settings WHERE key = 'gemini_api_key'"
  ).get();
  if (singleRow?.value) {
    const trimmed = singleRow.value.trim();
    if (trimmed) keySet.add(trimmed);
  }

  cachedKeys = Array.from(keySet);
  cacheTimestamp = now;
  return cachedKeys;
}

/** Get the next API key via round-robin rotation */
export function getGeminiApiKey(db?: Database.Database): string {
  const keys = loadKeys(db);
  if (keys.length === 0) {
    throw new Error('No Gemini API keys configured');
  }
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

/** Get a key excluding the failed one (for 429 failover) */
export function getGeminiApiKeyExcluding(failedKey: string, db?: Database.Database): string {
  const keys = loadKeys(db);
  const available = keys.filter((k) => k !== failedKey);
  if (available.length === 0) {
    throw new Error('No alternative Gemini API keys available');
  }
  return available[Math.floor(Math.random() * available.length)];
}

/** Get the configured Gemini model */
export function getGeminiModel(db?: Database.Database): string {
  const database = db ?? getDb();
  const row: any = database.prepare(
    "SELECT value FROM settings WHERE key = 'gemini_model'"
  ).get();
  return row?.value ?? 'gemini-2.5-flash';
}

/** Track API usage */
export function trackUsage(
  apiKey: string,
  model: string,
  callType: string,
  usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
  projectId?: number,
  db?: Database.Database,
): void {
  const database = db ?? getDb();
  const suffix = apiKey.slice(-4);
  database.prepare(`
    INSERT INTO api_key_usage (api_key_suffix, model, call_type, prompt_tokens, completion_tokens, total_tokens, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    suffix,
    model,
    callType,
    usage.promptTokenCount ?? 0,
    usage.candidatesTokenCount ?? 0,
    usage.totalTokenCount ?? 0,
    projectId ?? null,
  );
}

/** Add a new API key */
export function addApiKey(key: string, db?: Database.Database): void {
  const database = db ?? getDb();
  const row: any = database.prepare(
    "SELECT value FROM settings WHERE key = 'gemini_api_keys'"
  ).get();

  const existing = row?.value ? row.value.split(',').map((k: string) => k.trim()) : [];
  if (existing.includes(key.trim())) return; // Already exists

  existing.push(key.trim());
  database.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_keys', ?)"
  ).run(existing.join(','));
  invalidateKeyCache();
}

/** Remove an API key by suffix (last 4 chars) */
export function removeApiKey(suffix: string, db?: Database.Database): boolean {
  const database = db ?? getDb();
  const row: any = database.prepare(
    "SELECT value FROM settings WHERE key = 'gemini_api_keys'"
  ).get();
  if (!row?.value) return false;

  const keys = row.value.split(',').map((k: string) => k.trim());
  const filtered = keys.filter((k: string) => !k.endsWith(suffix));
  if (filtered.length === keys.length) return false; // Not found

  database.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_keys', ?)"
  ).run(filtered.join(','));
  invalidateKeyCache();
  return true;
}

/** Get list of keys with usage stats */
export function getKeyList(db?: Database.Database): Array<{
  suffix: string;
  calls_today: number;
  total_tokens_today: number;
  calls_7d: number;
  calls_30d: number;
}> {
  const database = db ?? getDb();
  const keys = loadKeys(database);

  return keys.map((key) => {
    const suffix = key.slice(-4);

    const today: any = database.prepare(`
      SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
      FROM api_key_usage
      WHERE api_key_suffix = ? AND created_at >= datetime('now', '-1 day')
    `).get(suffix);

    const week: any = database.prepare(`
      SELECT COUNT(*) as calls
      FROM api_key_usage
      WHERE api_key_suffix = ? AND created_at >= datetime('now', '-7 days')
    `).get(suffix);

    const month: any = database.prepare(`
      SELECT COUNT(*) as calls
      FROM api_key_usage
      WHERE api_key_suffix = ? AND created_at >= datetime('now', '-30 days')
    `).get(suffix);

    return {
      suffix,
      calls_today: today.calls,
      total_tokens_today: today.tokens,
      calls_7d: week.calls,
      calls_30d: month.calls,
    };
  });
}

/** Force cache invalidation */
export function invalidateKeyCache(): void {
  cachedKeys = null;
  cacheTimestamp = 0;
}

/** Reset key index (for testing) */
export function resetKeyIndex(): void {
  keyIndex = 0;
}
