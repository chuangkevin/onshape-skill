/**
 * videoAnalysis.ts — Express routes for video upload + AI feature extraction
 *
 * POST  /api/video/upload            — Upload video or multiple photos
 * POST  /api/video/:jobId/analyze    — Start async AI analysis (non-blocking)
 * GET   /api/video/:jobId/stream     — SSE progress stream
 * GET   /api/video/:jobId/features   — Get final feature list
 * DELETE /api/video/:jobId           — Delete job + frames
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { join, resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { getDb } from '../db.js';
import { extractFrames, adoptPhotosAsFrames, cleanupJobFrames, FRAMES_BASE_DIR } from '../services/videoService.js';
import {
  identifyObject,
  extractFeatures,
  searchMissingDimensions,
  buildAnalysisResult,
} from '../services/objectRecognition.js';
import { identifyVehicleFromImages, searchVehicleDimensionsPartial } from '../services/search.js';
import type { VideoJob, VideoAnalysisResult, VideoAnalysisSSEEvent } from '../../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_UPLOAD_DIR = resolve(__dirname, '../../../data/videos');

mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });
mkdirSync(FRAMES_BASE_DIR, { recursive: true });

// ── multer config ─────────────────────────────────────────────────────────────

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop() ?? 'bin';
    cb(null, `${randomUUID()}.${ext}`);
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mpeg'];
    const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    if ([...VIDEO_TYPES, ...IMAGE_TYPES].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const uploadPhotos = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, IMAGE_TYPES.includes(file.mimetype) ? true : new Error('Images only') as any);
  },
});

// ── router ────────────────────────────────────────────────────────────────────

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

function getJob(jobId: string): VideoJob | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(jobId) as VideoJob | undefined;
}

function updateJob(jobId: string, fields: Partial<VideoJob>): void {
  const db = getDb();
  const setters = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(fields), new Date().toISOString(), jobId];
  db.prepare(`UPDATE video_jobs SET ${setters}, updated_at = ? WHERE id = ?`).run(...values);
}

function sseEmit(res: Response, event: VideoAnalysisSSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function shouldAttemptVehicleLookup(objectInfo: { object_type: string; common_name: string; description: string; estimated_size_class: string }): boolean {
  const haystack = `${objectInfo.common_name} ${objectInfo.description}`.toLowerCase();
  return objectInfo.object_type === 'car'
    || objectInfo.estimated_size_class === 'vehicle'
    || haystack.includes('car')
    || haystack.includes('vehicle')
    || haystack.includes('suv')
    || haystack.includes('sedan')
    || haystack.includes('truck')
    || haystack.includes('coupe');
}

// ── POST /api/video/upload  (single video) ────────────────────────────────────

router.post('/upload', uploadVideo.single('video'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const isImage = req.file.mimetype.startsWith('image/');
  const jobId = randomUUID();
  const db = getDb();

  db.prepare(`
    INSERT INTO video_jobs (id, status, video_filename, original_name)
    VALUES (?, 'queued', ?, ?)
  `).run(jobId, req.file.filename, req.file.originalname);

  res.json({
    job_id: jobId,
    file_type: isImage ? 'image' : 'video',
    message: 'Upload successful. POST /api/video/:jobId/analyze to start analysis.',
  });
});

// ── POST /api/video/upload-photos  (multiple photos) ─────────────────────────

router.post('/upload-photos', uploadPhotos.array('photos', 20), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No photos uploaded' });
    return;
  }

  const jobId = randomUUID();
  const db = getDb();

  // Store all filenames as JSON in video_filename field
  const filenames = files.map((f) => f.filename);
  db.prepare(`
    INSERT INTO video_jobs (id, status, video_filename, original_name)
    VALUES (?, 'queued', ?, ?)
  `).run(jobId, JSON.stringify(filenames), files.map((f) => f.originalname).join(', '));

  res.json({
    job_id: jobId,
    file_type: 'photos',
    photo_count: files.length,
    message: 'Upload successful. POST /api/video/:jobId/analyze to start analysis.',
  });
});

// ── POST /api/video/:jobId/analyze ────────────────────────────────────────────

router.post('/:jobId/analyze', async (req: Request, res: Response) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status !== 'queued' && job.status !== 'error') {
    res.status(409).json({ error: `Job is already in status: ${job.status}` });
    return;
  }

  // Kick off async analysis; respond immediately
  res.json({ message: 'Analysis started. Connect to GET /api/video/:jobId/stream for progress.' });
  runAnalysis(job).catch((err) => {
    console.error('[video] runAnalysis error:', err);
  });
});

// ── GET /api/video/:jobId/stream  (SSE) ───────────────────────────────────────

router.get('/:jobId/stream', (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Poll DB for status changes and emit SSE events
  const POLL_MS = 800;
  let lastStatus = job.status;

  sseEmit(res, { type: 'status', status: job.status, message: statusMessage(job.status) });
  if (job.status === 'done' && job.features_json) {
    emitFinalResult(res, job);
    res.end();
    return;
  }

  const timer = setInterval(() => {
    const current = getJob(jobId);
    if (!current) { clearInterval(timer); res.end(); return; }

    if (current.status !== lastStatus) {
      lastStatus = current.status;
      sseEmit(res, { type: 'status', status: current.status, message: statusMessage(current.status) });

      if (current.frame_count > 0) {
        sseEmit(res, { type: 'frames', frame_count: current.frame_count });
      }

      if (current.status === 'done' && current.features_json) {
        emitFinalResult(res, current);
        clearInterval(timer);
        res.end();
        return;
      }

      if (current.status === 'error') {
        sseEmit(res, { type: 'error', message: current.error_message ?? 'Unknown error' });
        clearInterval(timer);
        res.end();
        return;
      }
    }
  }, POLL_MS);

  req.on('close', () => clearInterval(timer));
});

// ── GET /api/video/:jobId/features ────────────────────────────────────────────

router.get('/:jobId/features', (req: Request, res: Response) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status !== 'done') {
    res.status(202).json({ status: job.status, message: 'Analysis not complete yet' });
    return;
  }
  const result: VideoAnalysisResult = JSON.parse(job.features_json ?? '{}');
  res.json(result);
});

// ── GET /api/video  (list recent jobs) ───────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const jobs = db
    .prepare('SELECT id, status, original_name, frame_count, object_type, created_at, updated_at FROM video_jobs ORDER BY created_at DESC LIMIT 50')
    .all();
  res.json(jobs);
});

// ── DELETE /api/video/:jobId ──────────────────────────────────────────────────

router.delete('/:jobId', (req: Request, res: Response) => {
  const jid = String(req.params.jobId);
  const job = getJob(jid);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  cleanupJobFrames(jid);
  getDb().prepare('DELETE FROM video_jobs WHERE id = ?').run(jid);
  res.json({ message: 'Job deleted' });
});

// ── Analysis pipeline ─────────────────────────────────────────────────────────

async function runAnalysis(job: VideoJob): Promise<void> {
  const jobId = job.id;

  try {
    // ── Phase 1: Extract frames ──────────────────────────────────────────────
    updateJob(jobId, { status: 'extracting' });

    let framePaths: string[];
    const isMultiPhoto = job.video_filename.startsWith('[');

    if (isMultiPhoto) {
      const filenames: string[] = JSON.parse(job.video_filename);
      const fullPaths = filenames.map((fn) => join(VIDEO_UPLOAD_DIR, fn));
      framePaths = adoptPhotosAsFrames(fullPaths, jobId);
    } else {
      const videoPath = join(VIDEO_UPLOAD_DIR, job.video_filename);
      const { framePaths: fp, frameCount } = await extractFrames(videoPath, jobId);
      framePaths = fp;
      updateJob(jobId, { frame_count: frameCount });
    }

    updateJob(jobId, { frame_count: framePaths.length });

    if (framePaths.length === 0) {
      throw new Error('No frames could be extracted from the uploaded file.');
    }

    // ── Phase 2: Identify object ─────────────────────────────────────────────
    updateJob(jobId, { status: 'analyzing' });

    const objectInfo = await identifyObject(framePaths);
    updateJob(jobId, {
      object_type: objectInfo.object_type,
      object_description: objectInfo.description,
    });

    // ── Phase 3: Extract features from all frames ────────────────────────────
    const [rawFeatures, vehicleResult] = await Promise.all([
      extractFeatures(framePaths, objectInfo),
      shouldAttemptVehicleLookup(objectInfo)
        ? identifyVehicleFromImages(framePaths)
        : Promise.resolve({ found: false } as const),
    ]);

    // ── Phase 4: Web search for missing dimensions ───────────────────────────
    updateJob(jobId, { status: 'searching' });
    const [enrichedFeatures, vehicleDimensions] = await Promise.all([
      searchMissingDimensions(rawFeatures, objectInfo),
      vehicleResult.found
        ? searchVehicleDimensionsPartial(vehicleResult).catch((err) => {
            console.warn(`[video] Vehicle dimension lookup skipped: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
          })
        : Promise.resolve(undefined),
    ]);

    // ── Phase 5: Save result ─────────────────────────────────────────────────
    const result = buildAnalysisResult(
      objectInfo,
      enrichedFeatures,
      vehicleResult.found ? vehicleResult : undefined,
      vehicleDimensions,
    );
    updateJob(jobId, {
      status: 'done',
      features_json: JSON.stringify(result),
    });
  } catch (err: any) {
    console.error(`[video] Job ${jobId} failed:`, err);
    updateJob(jobId, {
      status: 'error',
      error_message: err?.message ?? String(err),
    });
  }
}

function emitFinalResult(res: Response, job: VideoJob): void {
  const result: VideoAnalysisResult = JSON.parse(job.features_json ?? '{}');
  if (result.object) {
    sseEmit(res, { type: 'object', object: result.object });
  }
  if (result.features) {
    sseEmit(res, { type: 'features', features: result.features });
  }
  sseEmit(res, { type: 'done', result });
}

function statusMessage(status: string): string {
  const msgs: Record<string, string> = {
    queued: '等待分析中…',
    extracting: '正在從影片擷取影格…',
    analyzing: 'Gemini AI 辨識物件與特徵中…',
    searching: '網路搜尋缺少的尺寸資料…',
    done: '分析完成！',
    error: '分析失敗',
  };
  return msgs[status] ?? status;
}

export default router;
