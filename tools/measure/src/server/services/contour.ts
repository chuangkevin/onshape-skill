import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FASTSAM_SCRIPT_PATH = resolve(__dirname, '../python/fastsam_segment.py');

const IS_WINDOWS = process.platform === 'win32';

// Configurable minimum confidence for FastSAM contours (env-overridable)
const FASTSAM_MIN_CONFIDENCE = parseFloat(process.env.FASTSAM_MIN_CONFIDENCE ?? '0.7');

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
 *
 * Contours with confidence below FASTSAM_MIN_CONFIDENCE are discarded.
 * Contours with no confidence field are treated as confidence 0 (discarded).
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
  const normalised = (parsed.contours as any[]).map((c: any) => {
    const raw: any[] = Array.isArray(c.contour_px) ? c.contour_px : c;
    const contour_px = raw.map((pt: any) =>
      Array.isArray(pt) ? { x: pt[0] as number, y: pt[1] as number } : { x: pt.x as number, y: pt.y as number },
    );
    return {
      label: c.label as string | undefined,
      contour_px,
      confidence: typeof c.confidence === 'number' ? c.confidence : 0,
    };
  }).filter((c) => c.contour_px.length >= 3);

  // Filter by confidence threshold — contours with no confidence field were set to 0 above
  const contours = normalised.filter((c) => c.confidence >= FASTSAM_MIN_CONFIDENCE);

  if (contours.length === 0) {
    console.warn(
      `[contour-fastsam] All ${normalised.length} contour(s) below confidence threshold (${FASTSAM_MIN_CONFIDENCE})`,
    );
    return { found: false, contours: [], method: 'fastsam', image_size: parsed?.image_size };
  }

  console.log(`[contour-fastsam] Detected ${contours.length} contour(s) (threshold: ${FASTSAM_MIN_CONFIDENCE})`);
  return { found: true, contours, method: 'fastsam', image_size: parsed?.image_size };
}
