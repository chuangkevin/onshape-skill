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
import { releasePreferredGeminiKey, reservePreferredGeminiKey } from '../geminiClient.js';
import { extractFrames, adoptPhotosAsFrames, cleanupJobFrames, FRAMES_BASE_DIR } from '../services/videoService.js';
import {
  identifyObject,
  extractFeatures,
  searchMissingDimensions,
  buildAnalysisResult,
} from '../services/objectRecognition.js';
import { identifyVehicleFromImages, searchVehicleDimensionsPartial } from '../services/search.js';
import type { ExtractedFeature, ObjectIdentification, PartialVehicleDimensions, VehicleIdentification, VideoJob, VideoAnalysisResult, VideoAnalysisSSEEvent } from '../../shared/types.js';

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
const STALE_VIDEO_JOB_MS = 2 * 60_000;
const VIDEO_JOB_HEARTBEAT_MS = 20_000;

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

function parseSavedVideoResult(raw: string | null | undefined): VideoAnalysisResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    return parsed?.result ? parsed.result as VideoAnalysisResult : parsed as VideoAnalysisResult;
  } catch (err) {
    console.warn('[video] Failed to parse saved partial result:', err);
    return null;
  }
}

interface VideoCheckpointState {
  featureExtractionComplete: boolean;
  vehicleDimensionSearchComplete: boolean;
}

function parseSavedVideoCheckpoint(raw: string | null | undefined): VideoCheckpointState {
  if (!raw) {
    return { featureExtractionComplete: false, vehicleDimensionSearchComplete: false };
  }
  try {
    const parsed = JSON.parse(raw) as any;
    return {
      featureExtractionComplete: Boolean(parsed?.checkpoints?.featureExtractionComplete),
      vehicleDimensionSearchComplete: Boolean(parsed?.checkpoints?.vehicleDimensionSearchComplete),
    };
  } catch {
    return { featureExtractionComplete: false, vehicleDimensionSearchComplete: false };
  }
}

function serializeVideoCheckpoint(result: VideoAnalysisResult, checkpoints: VideoCheckpointState): string {
  return JSON.stringify({ result, checkpoints });
}

function writePartialSnapshot(
  jobId: string,
  objectInfo: ObjectIdentification | null,
  features: ExtractedFeature[],
  vehicle: VehicleIdentification | undefined,
  vehicleDimensions: PartialVehicleDimensions | undefined,
  checkpoints: VideoCheckpointState,
): void {
  if (!objectInfo) return;
  const result = buildAnalysisResult(objectInfo, features, vehicle, vehicleDimensions);
  updateJob(jobId, {
    features_json: serializeVideoCheckpoint(result, checkpoints),
  });
}

function touchVideoJob(jobId: string): void {
  getDb().prepare('UPDATE video_jobs SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), jobId);
}

function hasCompleteVehicleDimensions(dims: PartialVehicleDimensions | undefined): boolean {
  return Boolean(
    dims?.length_mm
    && dims.width_mm
    && dims.height_mm
  );
}

function mergeVehicleDimensions(
  previous: PartialVehicleDimensions | undefined,
  next: PartialVehicleDimensions | undefined,
): PartialVehicleDimensions | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return {
    length_mm: next.length_mm ?? previous.length_mm,
    width_mm: next.width_mm ?? previous.width_mm,
    height_mm: next.height_mm ?? previous.height_mm,
    wheelbase_mm: next.wheelbase_mm ?? previous.wheelbase_mm,
    front_track_mm: next.front_track_mm ?? previous.front_track_mm,
    rear_track_mm: next.rear_track_mm ?? previous.rear_track_mm,
  };
}

function createActionKeyAssigner() {
  const reserved = new Set<string>();
  return {
    reserve(action: string): string | undefined {
      const key = reservePreferredGeminiKey(reserved);
      if (key) {
        reserved.add(key);
        console.log(`[video keys] ${action} -> ...${key.slice(-4)}`);
      }
      return key;
    },
    release(key?: string): void {
      if (!key) return;
      reserved.delete(key);
      releasePreferredGeminiKey(key);
    },
    probeAvailable(): boolean {
      const probe = reservePreferredGeminiKey(reserved);
      if (!probe) return false;
      reserved.add(probe);
      reserved.delete(probe);
      releasePreferredGeminiKey(probe);
      return true;
    },
  };
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
  const jobId = String(req.params.jobId);
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const cutoffIso = new Date(Date.now() - STALE_VIDEO_JOB_MS).toISOString();
  const claimed = getDb().prepare(
    `UPDATE video_jobs
     SET status = 'extracting', error_message = NULL, updated_at = ?
     WHERE id = ? AND (
       status IN ('queued', 'error')
       OR (status IN ('extracting', 'analyzing', 'searching') AND updated_at < ?)
     )`
  ).run(new Date().toISOString(), jobId, cutoffIso);
  if (claimed.changes === 0) {
    const current = getJob(jobId);
    res.status(409).json({ error: `Job is already in status: ${current?.status ?? 'unknown'}` });
    return;
  }

  const claimedJob = getJob(jobId);
  if (!claimedJob) {
    res.status(404).json({ error: 'Job not found after claim' });
    return;
  }

  // Kick off async analysis; respond immediately
  res.json({ message: 'Analysis started. Connect to GET /api/video/:jobId/stream for progress.' });
  runAnalysis(claimedJob).catch((err) => {
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
  let lastFeaturesJson = job.features_json ?? '';

  sseEmit(res, { type: 'status', status: job.status, message: statusMessage(job.status) });
  if (job.frame_count > 0) {
    sseEmit(res, { type: 'frames', frame_count: job.frame_count });
  }
  const initialPartial = parseSavedVideoResult(job.features_json);
  if (initialPartial?.object) {
    sseEmit(res, { type: 'object', object: initialPartial.object });
  }
  if (initialPartial?.features) {
    sseEmit(res, { type: 'features', features: initialPartial.features });
  }
  if (job.status === 'done' && job.features_json) {
    emitFinalResult(res, job);
    res.end();
    return;
  }
  if (job.status === 'error') {
    const partialResult = parseSavedVideoResult(job.features_json) ?? undefined;
    sseEmit(res, { type: 'error', message: job.error_message ?? 'Unknown error', result: partialResult });
    res.end();
    return;
  }

  const timer = setInterval(() => {
    const current = getJob(jobId);
    if (!current) { clearInterval(timer); res.end(); return; }

    if ((current.features_json ?? '') !== lastFeaturesJson) {
      lastFeaturesJson = current.features_json ?? '';
      const snapshot = parseSavedVideoResult(current.features_json);
      if (snapshot?.object) {
        sseEmit(res, { type: 'object', object: snapshot.object });
      }
      if (snapshot?.features) {
        sseEmit(res, { type: 'features', features: snapshot.features });
      }
    }

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
        const partialResult = parseSavedVideoResult(current.features_json) ?? undefined;
        sseEmit(res, { type: 'error', message: current.error_message ?? 'Unknown error', result: partialResult });
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
  const result = parseSavedVideoResult(job.features_json);
  res.json(result ?? {});
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
  const actionKeys = createActionKeyAssigner();
  let partialObject: ObjectIdentification | null = null;
  let partialFeatures: ExtractedFeature[] = [];
  let partialVehicle: VehicleIdentification | undefined;
  let partialVehicleDimensions: PartialVehicleDimensions | undefined;
  let featureExtractionComplete = false;
  let vehicleDimensionSearchComplete = false;
  const heartbeat = setInterval(() => touchVideoJob(jobId), VIDEO_JOB_HEARTBEAT_MS);

  try {
    const resumeResult = parseSavedVideoResult(job.features_json);
    const resumeCheckpoint = parseSavedVideoCheckpoint(job.features_json);
    if (resumeResult?.object) partialObject = resumeResult.object;
    if (resumeResult?.features) partialFeatures = resumeResult.features;
    if (resumeResult?.vehicle) partialVehicle = resumeResult.vehicle;
    if (resumeResult?.vehicle_dimensions) partialVehicleDimensions = resumeResult.vehicle_dimensions;
    featureExtractionComplete = resumeCheckpoint.featureExtractionComplete;
    vehicleDimensionSearchComplete = resumeCheckpoint.vehicleDimensionSearchComplete;

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

    const objectInfo = partialObject ?? await (async () => {
      const identifyObjectKey = actionKeys.reserve('identify-object');
      try {
        return await identifyObject(
          framePaths,
          undefined,
          identifyObjectKey,
        );
      } finally {
        actionKeys.release(identifyObjectKey);
      }
    })();
    partialObject = objectInfo;
    writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
      featureExtractionComplete,
      vehicleDimensionSearchComplete,
    });
    updateJob(jobId, {
      object_type: objectInfo.object_type,
      object_description: objectInfo.description,
    });

    // ── Phase 3: Extract features from all frames ────────────────────────────
    const vehicleKey = shouldAttemptVehicleLookup(objectInfo) && !partialVehicle ? actionKeys.reserve('identify-vehicle') : undefined;
    let rawFeatures: ExtractedFeature[] = partialFeatures;
    let vehicleResult: VehicleIdentification | { found: false } = partialVehicle ?? { found: false };
    try {
      const needsFeatureExtraction = !featureExtractionComplete;
      const needsVehicleLookup = shouldAttemptVehicleLookup(objectInfo) && !partialVehicle;
      const firstParallelBatchKey = needsFeatureExtraction && needsVehicleLookup && vehicleKey
        ? actionKeys.reserve('extract-features-batch-1')
        : undefined;
      const canRunVehicleInParallel = Boolean(needsFeatureExtraction && needsVehicleLookup && vehicleKey && firstParallelBatchKey);
      if (canRunVehicleInParallel) {
        const [featureOutcome, vehicleOutcome] = await Promise.allSettled([
          extractFeatures(framePaths, objectInfo, undefined, (batchIndex) => {
            const preferredApiKey = batchIndex === 0 ? firstParallelBatchKey : actionKeys.reserve(`extract-features-batch-${batchIndex + 1}`);
            return {
              preferredApiKey,
              avoidApiKeys: [vehicleKey].filter(Boolean) as string[],
              release: () => actionKeys.release(preferredApiKey),
            };
          }, (features) => {
            partialFeatures = features;
            writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
              featureExtractionComplete,
              vehicleDimensionSearchComplete,
            });
          }),
          identifyVehicleFromImages(framePaths, undefined, vehicleKey, [firstParallelBatchKey].filter(Boolean) as string[]).then((result) => {
            if (result.found) partialVehicle = result;
            writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
              featureExtractionComplete,
              vehicleDimensionSearchComplete,
            });
            return result;
          }),
        ]);
        if (featureOutcome.status === 'fulfilled') {
          rawFeatures = featureOutcome.value;
        }
        if (vehicleOutcome.status === 'fulfilled') {
          vehicleResult = vehicleOutcome.value;
        }
        if (featureOutcome.status === 'rejected') throw featureOutcome.reason;
        if (vehicleOutcome.status === 'rejected') throw vehicleOutcome.reason;
      } else {
        actionKeys.release(firstParallelBatchKey);
        actionKeys.release(vehicleKey);
        if (needsFeatureExtraction) {
          rawFeatures = await extractFeatures(framePaths, objectInfo, undefined, (batchIndex) => {
            const preferredApiKey = actionKeys.reserve(`extract-features-batch-${batchIndex + 1}`);
            return {
              preferredApiKey,
              release: () => actionKeys.release(preferredApiKey),
            };
          }, (features) => {
            partialFeatures = features;
            writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
              featureExtractionComplete,
              vehicleDimensionSearchComplete,
            });
          });
        }
        if (needsVehicleLookup) {
          const sequentialVehicleKey = actionKeys.reserve('identify-vehicle-sequential');
          vehicleResult = await identifyVehicleFromImages(framePaths, undefined, sequentialVehicleKey, []);
          if (vehicleResult.found) partialVehicle = vehicleResult;
          writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
            featureExtractionComplete,
            vehicleDimensionSearchComplete,
          });
          actionKeys.release(sequentialVehicleKey);
        }
      }
    } finally {
      actionKeys.release(vehicleKey);
    }
    partialFeatures = rawFeatures;
    partialVehicle = vehicleResult.found ? vehicleResult : undefined;
    featureExtractionComplete = true;
    writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
      featureExtractionComplete,
      vehicleDimensionSearchComplete,
    });

    // ── Phase 4: Web search for missing dimensions ───────────────────────────
    updateJob(jobId, { status: 'searching' });
    const needsFeatureSearch = rawFeatures.some((f) => f.value_mm === null || f.confidence === 'low');
    const needsVehicleDimensionSearch = vehicleResult.found && !vehicleDimensionSearchComplete;
    const searchDimensionsKey = needsFeatureSearch ? actionKeys.reserve('search-missing-dimensions') : undefined;
    const vehicleDimsKey = needsVehicleDimensionSearch ? actionKeys.reserve('search-vehicle-dimensions') : undefined;
    const searchAvoid = [vehicleDimsKey].filter(Boolean) as string[];
    const vehicleDimsAvoid = [searchDimensionsKey].filter(Boolean) as string[];
    let enrichedFeatures: ExtractedFeature[] = rawFeatures;
    let vehicleDimensions: PartialVehicleDimensions | undefined = partialVehicleDimensions;
    try {
      const canRunSearchesInParallel = Boolean(needsFeatureSearch && needsVehicleDimensionSearch && vehicleDimsKey && actionKeys.probeAvailable());
      if (canRunSearchesInParallel) {
        const [dimensionOutcome, vehicleDimsOutcome] = await Promise.allSettled([
          searchMissingDimensions(rawFeatures, objectInfo, undefined, searchDimensionsKey, searchAvoid),
          vehicleResult.found
            ? searchVehicleDimensionsPartial(vehicleResult, undefined, vehicleDimsKey, vehicleDimsAvoid).then((dims) => {
                const merged = mergeVehicleDimensions(partialVehicleDimensions, dims);
                partialVehicleDimensions = merged;
                return merged;
              }).catch((err) => {
                console.warn(`[video] Vehicle dimension lookup skipped: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
              })
            : Promise.resolve(undefined),
        ]);
        if (dimensionOutcome.status === 'fulfilled') {
          enrichedFeatures = dimensionOutcome.value;
          partialFeatures = enrichedFeatures;
          writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
            featureExtractionComplete,
            vehicleDimensionSearchComplete,
          });
        }
        if (vehicleDimsOutcome.status === 'fulfilled') {
          vehicleDimensions = mergeVehicleDimensions(partialVehicleDimensions, vehicleDimsOutcome.value);
          partialVehicleDimensions = vehicleDimensions;
          writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
            featureExtractionComplete,
            vehicleDimensionSearchComplete,
          });
        }
        if (dimensionOutcome.status === 'rejected') throw dimensionOutcome.reason;
        if (vehicleDimsOutcome.status === 'rejected') throw vehicleDimsOutcome.reason;
      } else {
        actionKeys.release(vehicleDimsKey);
        if (needsFeatureSearch) {
          enrichedFeatures = await searchMissingDimensions(rawFeatures, objectInfo, undefined, searchDimensionsKey, []);
          partialFeatures = enrichedFeatures;
          writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
            featureExtractionComplete,
            vehicleDimensionSearchComplete,
          });
          actionKeys.release(searchDimensionsKey);
        }
        const sequentialVehicleDimsKey = needsVehicleDimensionSearch ? actionKeys.reserve('search-vehicle-dimensions-sequential') : undefined;
        vehicleDimensions = needsVehicleDimensionSearch
          ? await searchVehicleDimensionsPartial(vehicleResult as VehicleIdentification, undefined, sequentialVehicleDimsKey, []).then((dims) => {
              const merged = mergeVehicleDimensions(partialVehicleDimensions, dims);
              partialVehicleDimensions = merged;
              writePartialSnapshot(jobId, partialObject, partialFeatures, partialVehicle, partialVehicleDimensions, {
                featureExtractionComplete,
                vehicleDimensionSearchComplete,
              });
              return merged;
            }).catch((err) => {
              console.warn(`[video] Vehicle dimension lookup skipped: ${err instanceof Error ? err.message : String(err)}`);
              return partialVehicleDimensions;
            })
          : vehicleDimensions;
        actionKeys.release(sequentialVehicleDimsKey);
      }
    } finally {
      actionKeys.release(searchDimensionsKey);
      actionKeys.release(vehicleDimsKey);
    }
    partialFeatures = enrichedFeatures;
    partialVehicleDimensions = vehicleDimensions;
    vehicleDimensionSearchComplete = hasCompleteVehicleDimensions(vehicleDimensions);

    // ── Phase 5: Save result ─────────────────────────────────────────────────
    const result = buildAnalysisResult(
      objectInfo,
      enrichedFeatures,
      vehicleResult.found ? vehicleResult : undefined,
      vehicleDimensions,
    );
    updateJob(jobId, {
      status: 'done',
      features_json: serializeVideoCheckpoint(result, {
        featureExtractionComplete: true,
        vehicleDimensionSearchComplete: hasCompleteVehicleDimensions(vehicleDimensions),
      }),
    });
  } catch (err: any) {
    console.error(`[video] Job ${jobId} failed:`, err);
    const partialResult = partialObject
      ? buildAnalysisResult(
          partialObject,
          partialFeatures,
          partialVehicle,
          partialVehicleDimensions,
        )
      : null;
    updateJob(jobId, {
      status: 'error',
      features_json: partialResult ? serializeVideoCheckpoint(partialResult, {
        featureExtractionComplete,
        vehicleDimensionSearchComplete,
      }) : null,
      error_message: err?.message ?? String(err),
    });
  } finally {
    clearInterval(heartbeat);
  }
}

function emitFinalResult(res: Response, job: VideoJob): void {
  const result = parseSavedVideoResult(job.features_json) ?? {} as VideoAnalysisResult;
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
