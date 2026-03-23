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
  image_size?: { width: number; height: number };
}

export interface GeminiContourResult {
  found: boolean;
  contours: Array<{
    label?: string;
    contour_px: Array<{ x: number; y: number }>;
  }>;
  method: 'gemini';
}

export interface ContourRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// FastSAM contour detection
// ---------------------------------------------------------------------------

/**
 * Run fastsam_segment.py and return segmentation contours.
 * The script auto-downloads FastSAM-s.pt if no local model is found.
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

  // ultralytics may print debug lines before the JSON — find the last JSON line
  const lastJsonLine = result.stdout.trim().split(/\r?\n/).reverse().find((l) => l.startsWith('{'));
  let parsed: any;
  try {
    parsed = JSON.parse(lastJsonLine ?? '');
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
    return { found: false, contours: [], method: 'fastsam', image_size: parsed?.image_size };
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
    return { found: false, contours: [], method: 'fastsam', image_size: parsed?.image_size };
  }

  console.log(`[contour-fastsam] Detected ${contours.length} contour(s)`);
  return { found: true, contours, method: 'fastsam', image_size: parsed?.image_size };
}

// ---------------------------------------------------------------------------
// Gemini contour detection
// ---------------------------------------------------------------------------

/**
 * Build the Gemini contour prompt. When a bbox ROI is provided, include its
 * coordinates so Gemini focuses on the correct region of the full image.
 */
function buildContourPrompt(roi?: ContourRoi): string {
  const bboxHint = roi
    ? `The main object is located at approximately x=${Math.round(roi.x)}, y=${Math.round(roi.y)}, ` +
      `width=${Math.round(roi.width)}, height=${Math.round(roi.height)} pixels (from top-left corner). ` +
      `Focus ONLY on this object.\n\n`
    : '';

  return `${bboxHint}\
Analyze this photo. Find the MAIN physical object (not the ruler, not the table, not hands).

Trace its EXACT outline as 20-60 coordinate points along the ACTUAL visible edge — NOT a bounding box.
Include notches, connectors, cutouts, curves, indentations.
Clockwise from top-left. Full-image pixel coordinates (0,0 = top-left, x→right, y→down).

Reply ONLY with JSON, no markdown:
{"found":true,"contours":[{"label":"name","contour_px":[{"x":10,"y":20},...]}]}
If no object: {"found":false,"contours":[]}`;
}

/**
 * Send the full image to Gemini and ask it to detect the contour of the main
 * object. When `roi` is provided its coordinates are embedded in the prompt
 * as a hint so Gemini focuses on the right region — no image cropping needed.
 */
export async function detectContourWithGemini(
  imagePath: string,
  projectId?: number,
  roi?: ContourRoi,
): Promise<GeminiContourResult> {
  const prompt = buildContourPrompt(roi);

  // --- Call Gemini ----------------------------------------------------------
  const { text } = await callGemini({
    prompt,
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

  if (!parsed || parsed.found !== true) {
    return { found: false, contours: [], method: 'gemini' };
  }

  if (!Array.isArray(parsed.contours) || parsed.contours.length === 0) {
    console.error('[contour-gemini] Response has found:true but no contours:', parsed);
    return { found: false, contours: [], method: 'gemini' };
  }

  // Validate and subsample
  const validContours = parsed.contours
    .filter((c: any) =>
      Array.isArray(c.contour_px) &&
      c.contour_px.length >= 3 &&
      c.contour_px.every((pt: any) => typeof pt.x === 'number' && typeof pt.y === 'number'),
    )
    .map((c: any) => {
      const MAX_POINTS = 200;
      let points: Array<{ x: number; y: number }> = c.contour_px.map((pt: any) => ({
        x: pt.x as number,
        y: pt.y as number,
      }));
      if (points.length > MAX_POINTS) {
        const step = points.length / MAX_POINTS;
        points = Array.from({ length: MAX_POINTS }, (_, i) => points[Math.floor(i * step)]);
      }
      return { label: c.label as string | undefined, contour_px: points };
    });

  if (validContours.length === 0) {
    console.error('[contour-gemini] No valid contours after validation');
    return { found: false, contours: [], method: 'gemini' };
  }

  console.log(
    `[contour-gemini] contour: ${validContours.length} contour(s)` +
    (roi ? ` (bbox hint: ${Math.round(roi.x)},${Math.round(roi.y)} ${Math.round(roi.width)}x${Math.round(roi.height)})` : '') +
    `, points: ${validContours.map((c: { contour_px: unknown[] }) => c.contour_px.length).join(',')}`,
  );

  return { found: true, contours: validContours, method: 'gemini' };
}
