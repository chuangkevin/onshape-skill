import { readFileSync } from 'fs';
import { getGeminiApiKey, getGeminiApiKeyExcluding, getGeminiModel, trackUsage } from './geminiKeys.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiRequestOptions {
  prompt: string;
  imagePaths?: string[];
  callType: string;
  projectId?: number;
  systemInstruction?: string;
  useGrounding?: boolean;
}

// Track bad keys with cooldown (key → timestamp when it failed)
const badKeys = new Map<string, number>();
const BAD_KEY_COOLDOWN_MS = 5 * 60_000; // 5 min cooldown for failed keys

function isKeyUsable(key: string): boolean {
  const failedAt = badKeys.get(key);
  if (!failedAt) return true;
  if (Date.now() - failedAt > BAD_KEY_COOLDOWN_MS) {
    badKeys.delete(key); // cooldown expired, retry
    return true;
  }
  return false;
}

function markKeyBad(key: string): void {
  badKeys.set(key, Date.now());
  console.warn(`[gemini] Key ...${key.slice(-4)} marked bad, cooldown ${BAD_KEY_COOLDOWN_MS / 1000}s`);
}

/** Call Gemini API with automatic key rotation and retry on failure */
export async function callGemini(options: GeminiRequestOptions): Promise<{
  text: string;
  usage: GeminiResponse['usageMetadata'];
}> {
  const { prompt, imagePaths, callType, projectId, systemInstruction, useGrounding } = options;
  const model = getGeminiModel();

  // Try up to 3 different keys
  const triedKeys = new Set<string>();
  let lastErr: any = null;

  // Collect keys to skip (already tried + known bad)
  const skipKeys = new Set<string>();
  for (const [k, t] of badKeys) {
    if (Date.now() - t < BAD_KEY_COOLDOWN_MS) skipKeys.add(k);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const key = getGeminiApiKey(undefined, skipKeys);
    if (triedKeys.has(key)) continue; // already tried this exact key
    triedKeys.add(key);
    skipKeys.add(key);

    try {
      return await doGeminiCall(key, model, prompt, imagePaths, callType, projectId, systemInstruction, useGrounding);
    } catch (err: any) {
      lastErr = err;
      if (err.status === 429 || err.status === 403 || err.status === 400) {
        markKeyBad(key);
        continue; // try next key
      }
      throw err; // non-retryable error
    }
  }

  throw lastErr ?? new Error('All Gemini API keys exhausted');
}

async function doGeminiCall(
  apiKey: string,
  model: string,
  prompt: string,
  imagePaths?: string[],
  callType?: string,
  projectId?: number,
  systemInstruction?: string,
  useGrounding?: boolean,
): Promise<{ text: string; usage: GeminiResponse['usageMetadata'] }> {
  const parts: any[] = [];

  // Add images as inline data
  if (imagePaths) {
    for (const imgPath of imagePaths) {
      const data = readFileSync(imgPath);
      const base64 = data.toString('base64');
      const mimeType = imgPath.endsWith('.png') ? 'image/png'
        : imgPath.endsWith('.webp') ? 'image/webp'
        : 'image/jpeg';
      parts.push({
        inlineData: { mimeType, data: base64 },
      });
    }
  }

  parts.push({ text: prompt });

  const body: any = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (useGrounding) {
    body.tools = [{ googleSearch: {} }];
  }

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err: any = new Error(`Gemini API error: ${res.status}`);
    err.status = res.status;
    err.body = await res.text();
    throw err;
  }

  const json: GeminiResponse = await res.json();
  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join('') ?? '';

  // Track usage
  if (json.usageMetadata) {
    trackUsage(apiKey, model, callType ?? 'unknown', json.usageMetadata, projectId);
  }

  return { text, usage: json.usageMetadata };
}
