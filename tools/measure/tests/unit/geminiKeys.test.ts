import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../src/server/db.js';
import {
  getGeminiApiKey,
  getGeminiApiKeyExcluding,
  getGeminiModel,
  trackUsage,
  addApiKey,
  removeApiKey,
  getKeyList,
  invalidateKeyCache,
  resetKeyIndex,
} from '../../src/server/geminiKeys.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  invalidateKeyCache();
  resetKeyIndex();
});

describe('getGeminiApiKey', () => {
  it('returns keys in round-robin order', () => {
    const key1 = getGeminiApiKey(db);
    const key2 = getGeminiApiKey(db);
    const key3 = getGeminiApiKey(db);

    expect(key1).toMatch(/^AIzaSy/);
    expect(key2).toMatch(/^AIzaSy/);
    expect(key1).not.toBe(key2);
    expect(key3).not.toBe(key2);
  });

  it('wraps around after exhausting all keys', () => {
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      keys.push(getGeminiApiKey(db));
    }
    // 5 keys, so 6th should equal 1st
    expect(keys[5]).toBe(keys[0]);
  });

  it('throws when no keys configured', () => {
    db.prepare("DELETE FROM settings WHERE key = 'gemini_api_keys'").run();
    invalidateKeyCache();
    expect(() => getGeminiApiKey(db)).toThrow('No Gemini API keys configured');
  });
});

describe('getGeminiApiKeyExcluding', () => {
  it('returns a different key', () => {
    const key1 = getGeminiApiKey(db);
    const alt = getGeminiApiKeyExcluding(key1, db);
    expect(alt).not.toBe(key1);
    expect(alt).toMatch(/^AIzaSy/);
  });

  it('throws when only one key and it is excluded', () => {
    db.prepare("UPDATE settings SET value = 'singleKey' WHERE key = 'gemini_api_keys'").run();
    invalidateKeyCache();
    expect(() => getGeminiApiKeyExcluding('singleKey', db)).toThrow(
      'No alternative Gemini API keys available'
    );
  });
});

describe('getGeminiModel', () => {
  it('returns seeded model', () => {
    expect(getGeminiModel(db)).toBe('gemini-2.5-flash');
  });

  it('returns default when not set', () => {
    db.prepare("DELETE FROM settings WHERE key = 'gemini_model'").run();
    expect(getGeminiModel(db)).toBe('gemini-2.5-flash');
  });
});

describe('trackUsage', () => {
  it('records usage in database', () => {
    const key = getGeminiApiKey(db);
    trackUsage(key, 'gemini-2.5-flash', 'ocr', {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
    }, undefined, db);

    const row: any = db.prepare('SELECT * FROM api_key_usage').get();
    expect(row.api_key_suffix).toBe(key.slice(-4));
    expect(row.model).toBe('gemini-2.5-flash');
    expect(row.call_type).toBe('ocr');
    expect(row.prompt_tokens).toBe(100);
    expect(row.completion_tokens).toBe(50);
    expect(row.total_tokens).toBe(150);
  });
});

describe('addApiKey / removeApiKey', () => {
  it('adds a new key', () => {
    addApiKey('newTestKey123', db);
    invalidateKeyCache();
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      keys.push(getGeminiApiKey(db));
    }
    expect(keys).toContain('newTestKey123');
  });

  it('does not duplicate existing key', () => {
    const key = getGeminiApiKey(db);
    invalidateKeyCache();
    resetKeyIndex();
    addApiKey(key, db);
    invalidateKeyCache();
    // Should still have 5 keys, not 6
    const row: any = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_keys'").get();
    expect(row.value.split(',').length).toBe(5);
  });

  it('removes a key by suffix', () => {
    const key = getGeminiApiKey(db);
    invalidateKeyCache();
    resetKeyIndex();
    const suffix = key.slice(-4);
    const removed = removeApiKey(suffix, db);
    expect(removed).toBe(true);
    invalidateKeyCache();
    // Now should have 4 keys
    const row: any = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_keys'").get();
    expect(row.value.split(',').length).toBe(4);
  });

  it('returns false when removing non-existent suffix', () => {
    expect(removeApiKey('zzzz', db)).toBe(false);
  });
});

describe('getKeyList', () => {
  it('returns stats for all keys', () => {
    const list = getKeyList(db);
    expect(list).toHaveLength(5);
    for (const entry of list) {
      expect(entry.suffix).toHaveLength(4);
      expect(entry.calls_today).toBe(0);
    }
  });

  it('reflects tracked usage', () => {
    const key = getGeminiApiKey(db);
    trackUsage(key, 'gemini-2.5-flash', 'test', { totalTokenCount: 200 }, undefined, db);
    trackUsage(key, 'gemini-2.5-flash', 'test', { totalTokenCount: 300 }, undefined, db);

    const list = getKeyList(db);
    const entry = list.find((e) => e.suffix === key.slice(-4));
    expect(entry).toBeTruthy();
    expect(entry!.calls_today).toBe(2);
    expect(entry!.total_tokens_today).toBe(500);
  });
});

describe('cache', () => {
  it('invalidateKeyCache forces fresh load', () => {
    getGeminiApiKey(db); // populates cache
    addApiKey('freshKey999', db);
    // Cache invalidated by addApiKey
    resetKeyIndex();
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(getGeminiApiKey(db));
    }
    expect(keys).toContain('freshKey999');
  });
});
