import { KeyPool, SqliteAdapter, StepRunner, planPreferredKeys } from '@kevinsisi/ai-core';
import type { PlannedStepAssignment, StepDefinition } from '@kevinsisi/ai-core';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import { getConfiguredGeminiKeys } from './geminiKeys.js';

const DEFAULT_COOLDOWN_MS = 5 * 60_000;
const AUTH_COOLDOWN_MS = 30 * 60_000;
const LEASE_MS = 15 * 60_000;
const RUNNER_TIMEOUT_MS = 60_000;

let pool: KeyPool | null = null;
const poolByDb = new WeakMap<Database.Database, KeyPool>();

function ensurePool(database: Database.Database): KeyPool {
  SqliteAdapter.createTable(database);
  const existing = poolByDb.get(database);
  if (existing) {
    return existing;
  }
  pool = new KeyPool(new SqliteAdapter(database), {
      defaultCooldownMs: DEFAULT_COOLDOWN_MS,
      authCooldownMs: AUTH_COOLDOWN_MS,
      allocationLeaseMs: LEASE_MS,
    });
  poolByDb.set(database, pool);
  return pool;
}

function syncConfiguredKeys(database: Database.Database): void {
  const adapter = new SqliteAdapter(database);
  SqliteAdapter.createTable(database);

  const configured = new Set(getConfiguredGeminiKeys(database));
  const rows = database.prepare('SELECT id, key FROM api_keys').all() as Array<{ id: number; key: string }>;
  const existing = new Set(rows.map(row => row.key));

  for (const key of configured) {
    if (!existing.has(key)) {
      adapter.insertKey(key);
    }
    database.prepare('UPDATE api_keys SET is_active = 1 WHERE key = ?').run(key);
  }

  for (const row of rows) {
    if (!configured.has(row.key)) {
      database.prepare('UPDATE api_keys SET is_active = 0, lease_until = 0, lease_token = NULL WHERE id = ?').run(row.id);
    }
  }

  ensurePool(database).invalidate();
}

export function getGeminiStepRunner(database?: Database.Database): StepRunner {
  const db = database ?? getDb();
  syncConfiguredKeys(db);
  const currentPool = ensurePool(db);
  return new StepRunner(currentPool, {
    defaultTimeoutMs: RUNNER_TIMEOUT_MS,
    maxRetries: 2,
  });
}

export async function planGeminiSteps(
  steps: readonly StepDefinition[],
  database?: Database.Database,
): Promise<PlannedStepAssignment[]> {
  const db = database ?? getDb();
  syncConfiguredKeys(db);
  return planPreferredKeys(ensurePool(db), steps);
}
