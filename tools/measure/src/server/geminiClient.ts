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

/** Call Gemini API with automatic key rotation and retry */
export async function callGemini(options: GeminiRequestOptions): Promise<{
  text: string;
  usage: GeminiResponse['usageMetadata'];
}> {
  const { prompt, imagePaths, callType, projectId, systemInstruction, useGrounding } = options;
  const model = getGeminiModel();
  const key = getGeminiApiKey();

  try {
    return await doGeminiCall(key, model, prompt, imagePaths, callType, projectId, systemInstruction, useGrounding);
  } catch (err: any) {
    if (err.status === 429) {
      // Retry with different key
      const retryKey = getGeminiApiKeyExcluding(key);
      return await doGeminiCall(retryKey, model, prompt, imagePaths, callType, projectId, systemInstruction, useGrounding);
    }
    throw err;
  }
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
