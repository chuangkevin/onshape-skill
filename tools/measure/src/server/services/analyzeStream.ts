import { resolve } from 'path';
import type { Response } from 'express';
import { getDb } from '../db.js';
import { extractOCRReadings } from './ocr.js';
import { extractLabels, identifyVehicleFromImages, searchOfficialSpecs, searchVehicleDimensionsPartial } from './search.js';
import { detectEdges, deriveROI } from './opencv.js';
import { fuseMeasurements } from './fusion.js';
import { UPLOAD_DIR } from '../routes/photos.js';
import type { AnalysisResults, LabelInfo, PartialVehicleDimensions, VehicleIdentification } from '@shared/types.js';

type StepId = 'ocr' | 'labels' | 'opencv' | 'search' | 'fusion';
type StepStatus = 'running' | 'done' | 'error';

function sendStep(res: Response, id: StepId, status: StepStatus, result?: unknown): void {
  if (res.writableEnded) return;
  const data = JSON.stringify({ id, status, ...(result !== undefined ? { result } : {}) });
  res.write(`event: step\ndata: ${data}\n\n`);
}

function sendComplete(res: Response, results: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: complete\ndata: ${JSON.stringify(results)}\n\n`);
  res.end();
}

function sendError(res: Response, message: string): void {
  if (res.writableEnded) return;
  res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  res.end();
}

export async function runAnalysisStream(res: Response, projectId: number): Promise<void> {
  // 30-second timeout
  const timeout = setTimeout(() => {
    sendError(res, 'Analysis pipeline timed out after 30 seconds');
  }, 30_000);

  try {
    const db = getDb();

    const photos: any[] = db.prepare(
      'SELECT * FROM photos WHERE project_id = ?',
    ).all(projectId);

    if (photos.length === 0) {
      clearTimeout(timeout);
      sendError(res, 'No photos in project');
      return;
    }

    const imagePaths = photos.map((p: any) => resolve(UPLOAD_DIR, p.filename));

    // Identify close-up photos for OCR
    const closeUps = photos.filter((p: any) => p.angle === 'close-up');
    const closeUpPaths = closeUps.length > 0
      ? closeUps.map((p: any) => resolve(UPLOAD_DIR, p.filename))
      : imagePaths;

    // === Parallel group 1: ocr, labels, opencv ===
    sendStep(res, 'ocr', 'running');
    sendStep(res, 'labels', 'running');
    sendStep(res, 'opencv', 'running');

    let ocrResults: any[] = [];
    let labelInfo: LabelInfo | undefined;
    let opencvResults: any[] = [];

    const ocrPromise = extractOCRReadings(closeUpPaths, projectId)
      .then((result) => {
        ocrResults = result;
        sendStep(res, 'ocr', 'done', result);
      })
      .catch((err) => {
        sendStep(res, 'ocr', 'error', { error: err.message });
      });

    const labelsPromise = extractLabels(imagePaths, projectId)
      .then((result) => {
        labelInfo = result;
        sendStep(res, 'labels', 'done', result);
      })
      .catch((err) => {
        sendStep(res, 'labels', 'error', { error: err.message });
      });

    const opencvPromise = Promise.all(
      photos.map(async (photo: any) => {
        const imgPath = resolve(UPLOAD_DIR, photo.filename);
        const drawings: any[] = db.prepare(
          'SELECT shape_data FROM drawings WHERE photo_id = ?',
        ).all(photo.id).map((d: any) => {
          try { return JSON.parse(d.shape_data); } catch { return {}; }
        });

        const roi = deriveROI(
          drawings.filter((d: any) => d.points_px),
          photo.width || 4000,
          photo.height || 3000,
        );

        return detectEdges(imgPath, roi);
      }),
    )
      .then((result) => {
        opencvResults = result;
        sendStep(res, 'opencv', 'done', result);
      })
      .catch((err) => {
        sendStep(res, 'opencv', 'error', { error: err.message });
      });

    await Promise.all([ocrPromise, labelsPromise, opencvPromise]);

    // === Sequential: search waits for labels ===
    let officialSpecs: any;
    sendStep(res, 'search', 'running');
    try {
      if (labelInfo?.model_number) {
        officialSpecs = await searchOfficialSpecs(labelInfo, projectId);
      }
      sendStep(res, 'search', 'done', officialSpecs);
    } catch (err: any) {
      sendStep(res, 'search', 'error', { error: err.message });
    }

    // Vehicle identification + dimensions (best-effort, non-fatal)
    let vehicle: VehicleIdentification | undefined;
    let vehicle_dimensions: PartialVehicleDimensions | undefined;
    try {
      const vehicleResult = await identifyVehicleFromImages(imagePaths, projectId);
      if (vehicleResult.found) {
        vehicle = vehicleResult;
        vehicle_dimensions = await searchVehicleDimensionsPartial(vehicleResult, projectId);
      }
    } catch (err: any) {
      console.warn('[analyzeStream] Vehicle lookup skipped:', err.message);
    }

    // === Sequential: fusion waits for all ===
    sendStep(res, 'fusion', 'running');
    try {
      const aiResults: AnalysisResults = {
        ocr_readings: ocrResults,
        label_info: labelInfo,
        official_specs: officialSpecs,
        overlay_interpretation: undefined,
        vehicle,
        vehicle_dimensions,
      };

      const project: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

      const fusionInput = {
        partName: project?.name ?? 'Unknown',
        photos: photos.map((photo: any, i: number) => {
          const scaleData = photo.scale_data ? JSON.parse(photo.scale_data) : null;
          return {
            filename: photo.filename,
            angle: photo.angle,
            scale_px_per_mm: scaleData?.px_per_mm,
            opencv_result: opencvResults[i],
          };
        }),
        aiResults,
      };

      const fused = fuseMeasurements(fusionInput);
      sendStep(res, 'fusion', 'done', fused);

      // Store results in DB
      db.prepare(`
        INSERT INTO analysis_results (project_id, result_type, raw_response, parsed_data)
        VALUES (?, 'full_analysis', ?, ?)
      `).run(
        projectId,
        JSON.stringify({ ai: aiResults, opencv: opencvResults, fused }),
        JSON.stringify(aiResults),
      );

      // Send final complete event
      sendComplete(res, { ai: aiResults, opencv: opencvResults, fused });
    } catch (err: any) {
      sendStep(res, 'fusion', 'error', { error: err.message });
      sendError(res, `Fusion failed: ${err.message}`);
    }
  } catch (err: any) {
    sendError(res, err.message || 'Analysis stream failed');
  } finally {
    clearTimeout(timeout);
  }
}
