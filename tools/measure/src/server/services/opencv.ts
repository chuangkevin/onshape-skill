import { execFile } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { OpenCVResult } from '@shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../python/edge_detect.py');

let pythonAvailable: boolean | null = null;
let pythonCommand = 'python';

/** Reset cached state (for testing) */
export function resetPythonCheck(): void {
  pythonAvailable = null;
  pythonCommand = 'python';
}

/** Check if Python + OpenCV are available */
export async function checkPython(): Promise<boolean> {
  if (pythonAvailable !== null) return pythonAvailable;

  for (const cmd of ['python', 'python3']) {
    try {
      const result = await runCommand(cmd, ['-c', 'import cv2; print(cv2.__version__)']);
      if (result.exitCode === 0) {
        pythonCommand = cmd;
        pythonAvailable = true;
        console.log(`Python OpenCV available: ${cmd} (cv2 ${result.stdout.trim()})`);
        return true;
      }
    } catch {
      // Try next command
    }
  }

  pythonAvailable = false;
  console.warn(
    'Python + OpenCV not available. Install with: pip install opencv-python numpy',
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
    execFile(cmd, args, {
      shell: true,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024, // 10MB for large contour outputs
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (error as any).code ?? 1 : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
      });
    });
  });
}
