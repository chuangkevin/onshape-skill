import { readFileSync } from 'fs';
import { getGeminiModel, trackUsage } from './geminiKeys.js';
import { getGeminiStepRunner } from './aiCoreGeminiPool.js';

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
  preferredApiKey?: string;
}

interface GeminiSingleCallOptions extends Omit<GeminiRequestOptions, 'preferredApiKey'> {
  apiKey: string;
}

/** Call Gemini API with automatic key rotation and retry on failure */
export async function callGemini(options: GeminiRequestOptions): Promise<{
  text: string;
  usage: GeminiResponse['usageMetadata'];
}> {
  const runner = getGeminiStepRunner();
  const preferredKey = options.preferredApiKey
    ? options.preferredApiKey
    : null;
  const result = await runner.runStep({
    id: options.callType,
    name: options.callType,
    preferredKey,
    allowSharedFallback: true,
    run: (apiKey) => callGeminiWithApiKey({
      apiKey,
      prompt: options.prompt,
      imagePaths: options.imagePaths,
      callType: options.callType,
      projectId: options.projectId,
      systemInstruction: options.systemInstruction,
      useGrounding: options.useGrounding,
    }),
  });
  return result.value;
}

export async function callGeminiWithApiKey(options: GeminiSingleCallOptions): Promise<{
  text: string;
  usage: GeminiResponse['usageMetadata'];
}> {
  const { apiKey, prompt, imagePaths, callType, projectId, systemInstruction, useGrounding } = options;
  const model = getGeminiModel();
  return doGeminiCall(apiKey, model, prompt, imagePaths, callType, projectId, systemInstruction, useGrounding);
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
