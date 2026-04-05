import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { OpenCVResult } from '@shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../python/edge_detect.py');

const IS_WINDOWS = process.platform === 'win32';

let pythonAvailable: boolean | null = null;
let pythonCommand = 'python';

/** Reset cached state (for testing) */
export function resetPythonCheck(): void {
  pythonAvailable = null;
  pythonCommand = 'python';
}

/** Resolve a command name to its full path using where/which */
async function resolveFullPath(cmd: string): Promise<string | null> {
  const whichCmd = IS_WINDOWS ? 'where' : 'which';
  try {
    const result = await runCommand(whichCmd, [cmd]);
    if (result.exitCode === 0) {
      // 'where' on Windows may return multiple lines; take the first
      const fullPath = result.stdout.trim().split(/\r?\n/)[0];
      if (fullPath) return fullPath;
    }
  } catch {
    // not found
  }
  return null;
}

/** Check if Python + OpenCV are available */
export async function checkPython(): Promise<boolean> {
  if (pythonAvailable !== null) return pythonAvailable;

  // Build ordered list of candidate Python paths
  const candidates: string[] = [];

  // 1. PYTHON_PATH env var (for Docker / explicit config)
  if (process.env.PYTHON_PATH) {
    candidates.push(process.env.PYTHON_PATH);
  }

  // 2. Resolve full paths via where/which
  if (IS_WINDOWS) {
    const resolved = await resolveFullPath('python');
    if (resolved) candidates.push(resolved);
  } else {
    for (const name of ['python3', 'python']) {
      const resolved = await resolveFullPath(name);
      if (resolved) candidates.push(resolved);
    }
  }

  // 3. Common fallback paths (Linux / macOS)
  if (!IS_WINDOWS) {
    for (const p of ['/usr/bin/python3', '/usr/local/bin/python3']) {
      if (existsSync(p)) candidates.push(p);
    }
  }

  // 4. Last resort: try bare command names (relies on shell PATH)
  if (IS_WINDOWS) {
    candidates.push('python', 'python3');
  } else {
    candidates.push('python3', 'python');
  }

  // De-duplicate while preserving order
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  // Try each candidate
  for (const cmd of uniqueCandidates) {
    try {
      const result = await runCommand(cmd, ['-c', 'import cv2; print(cv2.__version__)']);
      if (result.exitCode === 0) {
        pythonCommand = cmd;
        pythonAvailable = true;
        console.log(`Python detected at: ${cmd}`);
        console.log(`Python OpenCV available (cv2 ${result.stdout.trim()})`);
        return true;
      }
    } catch {
      // Try next candidate
    }
  }

  pythonAvailable = false;
  console.warn(
    'Python NOT detected. Install Python + OpenCV with: pip install opencv-python numpy',
  );
  return false;
}

/** Run edge detection on an image with optional ROI */
export async function detectEdges(
  imagePath: string,
  roi?: { x: number; y: number; width: number; height: number },
  epsilon?: number,
): Promise<OpenCVResult> {
  const available = await checkPython();
  if (!available) {
    return { contours: [], circles: [], error: 'Python + OpenCV not available' };
  }

  const args = [SCRIPT_PATH, imagePath];
  if (roi) args.push(JSON.stringify(roi));
  if (epsilon !== undefined) args.push(String(epsilon));
  // --max-size defaults to 2048 in edge_detect.py; --min-contour-area defaults to 0.005

  const result = await runCommand(pythonCommand, args);

  if (result.exitCode !== 0) {
    return { contours: [], circles: [], error: `Python error: ${result.stderr}` };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed.error) {
      return { contours: [], circles: [], error: parsed.error };
    }
    return {
      contours: parsed.contours.map((c: any) => ({
        contour_px: c.contour_px.map((p: number[]) => ({ x: p[0], y: p[1] })),
        area_px: c.area_px,
        bounding_box: c.bounding_box,
      })),
      circles: parsed.circles.map((c: any) => ({
        center_px: c.center_px,
        radius_px: c.radius_px,
      })),
    };
  } catch (e) {
    return { contours: [], circles: [], error: `Failed to parse output: ${result.stdout}` };
  }
}

/** Derive ROI from user drawing bounding box with 10% padding */
export function deriveROI(
  drawings: Array<{ points_px?: Array<{ x: number; y: number }> }>,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } | undefined {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  for (const d of drawings) {
    if (d.points_px) {
      for (const p of d.points_px) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
        hasPoints = true;
      }
    }
  }

  if (!hasPoints) return undefined;

  // Add 10% padding
  const w = maxX - minX;
  const h = maxY - minY;
  const padX = w * 0.1;
  const padY = h * 0.1;

  return {
    x: Math.max(0, Math.floor(minX - padX)),
    y: Math.max(0, Math.floor(minY - padY)),
    width: Math.min(imageWidth, Math.ceil(w + 2 * padX)),
    height: Math.min(imageHeight, Math.ceil(h + 2 * padY)),
  };
}

function runCommand(cmd: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // On Windows with shell:true, wrap args containing spaces/semicolons in double quotes
    const safeArgs = IS_WINDOWS
      ? args.map(a => (a.includes(' ') || a.includes(';')) ? `"${a}"` : a)
      : args;

    const proc = spawn(cmd, safeArgs, {
      shell: true,
      windowsHide: true,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('close', (code: number | null) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    proc.on('error', (e: Error) => resolve({ exitCode: 1, stdout, stderr: e.message }));
  });
}
