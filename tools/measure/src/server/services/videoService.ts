import { spawn } from 'child_process';
import { mkdirSync, readdirSync, existsSync, rmSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FRAMES_BASE_DIR = resolve(__dirname, '../../../data/frames');

/** Ensure base frames directory exists */
export function ensureFramesDir(): void {
  mkdirSync(FRAMES_BASE_DIR, { recursive: true });
}

/** Create isolated output directory for a job */
export function getJobFramesDir(jobId: string): string {
  const dir = join(FRAMES_BASE_DIR, jobId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Delete all frames and directory for a job */
export function cleanupJobFrames(jobId: string): void {
  const dir = join(FRAMES_BASE_DIR, jobId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface ExtractFramesResult {
  framePaths: string[];
  frameCount: number;
}

/**
 * Extract frames from a video file using ffmpeg.
 * @param videoPath  Absolute path to the uploaded video
 * @param jobId      Job ID (used as output subdirectory)
 * @param fps        Frames per second to extract (default: 1)
 * @param maxFrames  Cap total frames extracted (default: 30)
 */
export async function extractFrames(
  videoPath: string,
  jobId: string,
  fps: number = 1,
  maxFrames: number = 30,
): Promise<ExtractFramesResult> {
  const outDir = getJobFramesDir(jobId);
  const outputPattern = join(outDir, 'frame_%04d.jpg');

  await runFfmpeg([
    '-i', videoPath,
    '-vf', `fps=${fps}`,
    '-vframes', String(maxFrames),
    '-q:v', '3',
    '-f', 'image2',
    outputPattern,
  ]);

  const framePaths = readdirSync(outDir)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => join(outDir, f));

  return { framePaths, frameCount: framePaths.length };
}

/**
 * Copy individual uploaded images into a job's frames directory.
 * Used when the user uploads photos instead of a video.
 */
export function adoptPhotosAsFrames(photoPaths: string[], jobId: string): string[] {
  const outDir = getJobFramesDir(jobId);
  return photoPaths.map((src, i) => {
    const ext = src.split('.').pop() ?? 'jpg';
    const dest = join(outDir, `frame_${String(i + 1).padStart(4, '0')}.${ext}`);
    copyFileSync(src, dest);
    return dest;
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const ffmpegBin = process.env.FFMPEG_PATH ?? 'ffmpeg';
    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        res();
      } else {
        rej(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-800)}`));
      }
    });

    proc.on('error', (err) => {
      rej(new Error(`Failed to start ffmpeg: ${err.message}. Ensure ffmpeg is installed.`));
    });
  });
}
