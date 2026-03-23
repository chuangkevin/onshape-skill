import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { callGemini } from '../geminiClient.js';
import { parseJsonFromText } from './ruler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FASTSAM_SCRIPT_PATH = resolve(__dirname, '../python/fastsam_segment.py');

const IS_WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Helpers shared within this module
// ---------------------------------------------------------------------------

async function resolvePythonCommand(): Promise<string> {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;

  const whichCmd = IS_WINDOWS ? 'where' : 'which';
  const candidates = IS_WINDOWS ? ['python', 'python3'] : ['python3', 'python'];

  for (const name of candidates) {
    try {
      const found = await new Promise<string | null>((res) => {
        const p = spawn(whichCmd, [name], { shell: true, windowsHide: true });
        let out = '';
        p.stdout.on('data', (d: Buffer) => (out += d.toString()));
        p.on('close', (code: number | null) => res(code === 0 ? out.trim().split(/\r?\n/)[0] || null : null));
        p.on('error', () => res(null));
      });
      if (found) return found;
    } catch {
      // try next
    }
  }

  return IS_WINDOWS ? 'python' : 'python3';
}

function spawnJson(cmd: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const safeArgs = IS_WINDOWS
      ? args.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a))
      : args;
    const proc = spawn(cmd, safeArgs, { shell: true, windowsHide: true, env: process.env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('close', (code: number | null) => res({ exitCode: code ?? 1, stdout, stderr }));
    proc.on('error', (e: Error) => res({ exitCode: 1, stdout, stderr: e.message }));
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FastSAMContourResult {
  found: boolean;
  contours: Array<{
    label?: string;
    contour_px: Array<{ x: number; y: number }>;
    confidence?: number;
  }>;
  method: 'fastsam' | 'fastsam_unavailable';
}

export interface GeminiContourResult {
  found: boolean;
  contours: Array<{
    label?: string;
    contour_px: Array<{ x: number; y: number }>;
  }>;
  method: 'gemini';
}

// ---------------------------------------------------------------------------
// FastSAM contour detection
// ---------------------------------------------------------------------------

/**
 * Run fastsam_segment.py and return segmentation contours.
 * If FastSAM / ultralytics is not installed the script emits
 * `{"error":"fastsam_unavailable"}` — this is handled gracefully.
 */
export async function detectContourWithFastSAM(
  imagePath: string,
  roi?: { x1: number; y1: number; x2: number; y2: number },
): Promise<FastSAMContourResult> {
  if (!existsSync(FASTSAM_SCRIPT_PATH)) {
    console.warn('[contour-fastsam] Script not found:', FASTSAM_SCRIPT_PATH);
    return { found: false, contours: [], method: 'fastsam_unavailable' };
  }

  const pythonCmd = await resolvePythonCommand();
  const args = [FASTSAM_SCRIPT_PATH, '--image', imagePath];
  if (roi) {
    args.push('--roi', `${roi.x1},${roi.y1},${roi.x2},${roi.y2}`);
  }

  const result = await spawnJson(pythonCmd, args);

  let parsed: any;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    console.error('[contour-fastsam] Failed to parse output:', result.stdout, result.stderr);
    return { found: false, contours: [], method: 'fastsam_unavailable' };
  }

  if (parsed?.error === 'fastsam_unavailable') {
    console.warn('[contour-fastsam] FastSAM unavailable (ultralytics not installed)');
    return { found: false, contours: [], method: 'fastsam_unavailable' };
  }

  if (parsed?.error) {
    console.error('[contour-fastsam] Script error:', parsed.error);
    return { found: false, contours: [], method: 'fastsam' };
  }

  if (!Array.isArray(parsed?.contours) || parsed.contours.length === 0) {
    return { found: false, contours: [], method: 'fastsam' };
  }

  // Normalise: script may return [[x,y],...] arrays or [{x,y},...] objects
  const contours = (parsed.contours as any[]).map((c: any) => {
    const raw: any[] = Array.isArray(c.contour_px) ? c.contour_px : c;
    const contour_px = raw.map((pt: any) =>
      Array.isArray(pt) ? { x: pt[0] as number, y: pt[1] as number } : { x: pt.x as number, y: pt.y as number },
    );
    return {
      label: c.label as string | undefined,
      contour_px,
      confidence: c.confidence as number | undefined,
    };
  }).filter((c) => c.contour_px.length >= 3);

  if (contours.length === 0) {
    return { found: false, contours: [], method: 'fastsam' };
  }

  console.log(`[contour-fastsam] Detected ${contours.length} contour(s)`);
  return { found: true, contours, method: 'fastsam' };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const CONTOUR_PROMPT = `\
Analyze this photo. Find the MAIN physical object (ignore rulers, fingers, table, background).

Trace its outline as 20-80 coordinate points along the ACTUAL visible edge — not a bounding box.
Follow the real shape: notches, tabs, connectors, curves, indentations.
Place more points at corners/curves, fewer on straight edges.
Clockwise from top-left. Pixel coordinates (origin top-left, x→right, y→down).

Reply with ONLY JSON, no markdown:
{"found":true,"contours":[{"label":"name","contour_px":[{"x":10,"y":20},{"x":50,"y":20},{"x":55,"y":25},{"x":55,"y":80},{"x":10,"y":80}]}]}

If no object: {"found":false,"contours":[]}`;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Send an image to Gemini and ask it to detect the contour (outline) of the
 * main physical object(s) in the scene.  Returns an array of contours, each
 * consisting of pixel-coordinate points that trace the object edge.
 */
export async function detectContourWithGemini(
  imagePath: string,
  projectId?: number,
): Promise<GeminiContourResult> {
  // --- Call Gemini ----------------------------------------------------------
  const { text } = await callGemini({
    prompt: CONTOUR_PROMPT,
    imagePaths: [imagePath],
    callType: 'contour-detection',
    projectId,
  });

  // --- Parse response -------------------------------------------------------
  let parsed: any;
  try {
    parsed = parseJsonFromText(text);
  } catch {
    console.error('[contour-gemini] Failed to parse Gemini response as JSON:', text);
    return { found: false, contours: [], method: 'gemini' };
  }

  // --- Validate -------------------------------------------------------------
  if (!parsed || parsed.found !== true) {
    return { found: false, contours: [], method: 'gemini' };
  }

  if (!Array.isArray(parsed.contours) || parsed.contours.length === 0) {
    console.error('[contour-gemini] Response has found:true but no contours:', parsed);
    return { found: false, contours: [], method: 'gemini' };
  }

  // Validate each contour has at least 3 points with numeric coordinates
  const validContours = parsed.contours.filter((c: any) => {
    if (!Array.isArray(c.contour_px) || c.contour_px.length < 3) return false;
    return c.contour_px.every(
      (pt: any) => typeof pt.x === 'number' && typeof pt.y === 'number',
    );
  });

  if (validContours.length === 0) {
    console.error('[contour-gemini] No contours with >= 3 valid points:', parsed);
    return { found: false, contours: [], method: 'gemini' };
  }

  // Subsample if too many points (Gemini sometimes generates hundreds)
  const MAX_POINTS = 200;
  const processedContours = validContours.map((c: any) => {
    let points: Array<{ x: number; y: number }> = c.contour_px.map((pt: any) => ({ x: pt.x, y: pt.y }));
    if (points.length > MAX_POINTS) {
      const step = points.length / MAX_POINTS;
      points = Array.from({ length: MAX_POINTS }, (_, i) => points[Math.floor(i * step)]);
      console.log(`[contour-gemini] Subsampled ${c.contour_px.length} → ${MAX_POINTS} points`);
    }
    return { label: c.label as string | undefined, contour_px: points };
  });

  console.log(`[contour-gemini] Detected ${processedContours.length} contour(s), points: ${processedContours.map((c: { contour_px: number[][] }) => c.contour_px.length).join(',')}`);

  return {
    found: true,
    contours: processedContours,
    method: 'gemini',
  };
}
