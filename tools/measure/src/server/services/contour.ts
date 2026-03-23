import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { callGemini } from '../geminiClient.js';
import { parseJsonFromText } from './ruler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FASTSAM_SCRIPT_PATH = resolve(__dirname, '../python/fastsam_segment.py');
const CROP_SCRIPT_PATH = resolve(__dirname, '../python/crop_image.py');

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
// Prompts
// ---------------------------------------------------------------------------

/** Used when we pass only the cropped object image — Gemini sees just the object */
const CONTOUR_PROMPT_CROPPED = `\
This image shows a single physical object cropped from a larger photo.

Trace its EXACT outline — follow the actual physical edges, NOT a bounding box.
Include ALL irregular features: notches, cutouts, connectors, curves, tabs, indentations.
Provide 20-60 points. More points on curves and corners, fewer on straight edges.
Clockwise from top-left. Pixel coordinates relative to THIS image (0,0 = top-left, x→right, y→down).

Reply ONLY with JSON, no markdown:
{"found":true,"contours":[{"label":"object name","contour_px":[{"x":10,"y":20},...]}]}
If unclear: {"found":false,"contours":[]}`;

/** Fallback when no crop ROI — full image context */
const CONTOUR_PROMPT_FULL = `\
Analyze this photo. Find the MAIN physical object (not the ruler, not the table, not hands).

Trace its EXACT outline as 20-60 coordinate points along the ACTUAL visible edge — NOT a bounding box.
Include notches, connectors, cutouts, curves, indentations.
Clockwise from top-left. Full-image pixel coordinates (0,0 = top-left, x→right, y→down).

Reply ONLY with JSON, no markdown:
{"found":true,"contours":[{"label":"name","contour_px":[{"x":10,"y":20},...]}]}
If no object: {"found":false,"contours":[]}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crop image using OpenCV via Python, return temp file path or null on failure */
async function cropImageWithPython(
  pythonCmd: string,
  imagePath: string,
  roi: { x: number; y: number; width: number; height: number },
): Promise<string | null> {
  if (!existsSync(CROP_SCRIPT_PATH)) {
    console.warn('[contour-gemini] crop_image.py not found, skipping crop');
    return null;
  }
  const ext = imagePath.match(/\.[^.]+$/)?.[0] ?? '.jpg';
  const tmpPath = resolve(tmpdir(), `measure_crop_${Date.now()}${ext}`);
  const args = [
    CROP_SCRIPT_PATH,
    imagePath,
    String(Math.floor(roi.x)),
    String(Math.floor(roi.y)),
    String(Math.ceil(roi.width)),
    String(Math.ceil(roi.height)),
    tmpPath,
  ];
  const result = await spawnJson(pythonCmd, args);
  try {
    const parsed = JSON.parse(result.stdout.trim());
    if (parsed.ok && existsSync(tmpPath)) {
      console.log(`[contour-gemini] Cropped image to ${roi.width}x${roi.height} at (${roi.x},${roi.y})`);
      return tmpPath;
    }
  } catch { /* ignore */ }
  console.warn('[contour-gemini] crop failed:', result.stderr || result.stdout);
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface ContourRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Send an image to Gemini and ask it to detect the contour of the main object.
 * When `roi` is provided, the image is first cropped to that region so Gemini
 * sees only the object — greatly improving accuracy in cluttered scenes.
 * Returned contour coordinates are always in full-image pixel space.
 */
export async function detectContourWithGemini(
  imagePath: string,
  projectId?: number,
  roi?: ContourRoi,
): Promise<GeminiContourResult> {
  const pythonCmd = await resolvePythonCommand();

  // Try to crop the image to the ROI so Gemini only sees the target object
  let imageToSend = imagePath;
  let cropPath: string | null = null;
  let offsetX = 0;
  let offsetY = 0;

  if (roi) {
    cropPath = await cropImageWithPython(pythonCmd, imagePath, roi);
    if (cropPath) {
      imageToSend = cropPath;
      offsetX = Math.floor(roi.x);
      offsetY = Math.floor(roi.y);
    }
  }

  const prompt = cropPath ? CONTOUR_PROMPT_CROPPED : CONTOUR_PROMPT_FULL;

  // --- Call Gemini ----------------------------------------------------------
  let text: string;
  try {
    ({ text } = await callGemini({
      prompt,
      imagePaths: [imageToSend],
      callType: 'contour-detection',
      projectId,
    }));
  } finally {
    // Always clean up temp crop file
    if (cropPath) {
      try { unlinkSync(cropPath); } catch { /* ignore */ }
    }
  }

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

  // Validate and offset coordinates back to full-image space
  const validContours = parsed.contours
    .filter((c: any) =>
      Array.isArray(c.contour_px) &&
      c.contour_px.length >= 3 &&
      c.contour_px.every((pt: any) => typeof pt.x === 'number' && typeof pt.y === 'number'),
    )
    .map((c: any) => {
      const MAX_POINTS = 200;
      let points: Array<{ x: number; y: number }> = c.contour_px.map((pt: any) => ({
        x: pt.x + offsetX,
        y: pt.y + offsetY,
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
    `[contour-gemini] ${cropPath ? 'cropped-image' : 'full-image'} contour: ` +
    `${validContours.length} contour(s), offset=(${offsetX},${offsetY}), ` +
    `points: ${validContours.map((c: { contour_px: unknown[] }) => c.contour_px.length).join(',')}`,
  );

  return { found: true, contours: validContours, method: 'gemini' };
}
