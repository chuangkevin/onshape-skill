import { resolve } from 'path';
import { getDb } from '../db.js';
import { extractOCRReadings } from './ocr.js';
import { extractLabels, searchOfficialSpecs, identifyVehicleFromImages, searchVehicleDimensionsPartial } from './search.js';
import { detectEdges, deriveROI } from './opencv.js';
import { evaluateQuality } from './qualityGate.js';
import { UPLOAD_DIR } from '../routes/photos.js';
import type { AnalysisResults, OpenCVResult, PartialVehicleDimensions, QualityReport, VehicleIdentification } from '@shared/types.js';

export interface FullAnalysisResult {
  ai: AnalysisResults;
  opencv: OpenCVResult[];
  quality: QualityReport;
  vehicle?: VehicleIdentification;
  vehicle_dimensions?: PartialVehicleDimensions;
}

/** Run full parallel analysis pipeline for a project */
export async function runAnalysisPipeline(projectId: number): Promise<FullAnalysisResult> {
  const db = getDb();

  // Get all photos
  const photos: any[] = db.prepare(
    'SELECT * FROM photos WHERE project_id = ?'
  ).all(projectId);

  if (photos.length === 0) {
    throw new Error('No photos in project');
  }

  const imagePaths = photos.map((p: any) => resolve(UPLOAD_DIR, p.filename));

  // Identify close-up photos (for OCR) vs other views
  const closeUps = photos.filter((p: any) => p.angle === 'close-up');
  const closeUpPaths = closeUps.length > 0
    ? closeUps.map((p: any) => resolve(UPLOAD_DIR, p.filename))
    : imagePaths; // Fallback: try all photos

  // Run tasks in parallel using different API keys
  const [ocrResults, labelInfo, opencvResults] = await Promise.all([
    // Task 1: OCR caliper readings
    extractOCRReadings(closeUpPaths, projectId),

    // Task 2: Label extraction
    extractLabels(imagePaths, projectId),

    // Task 3: OpenCV edge detection on all photos
    Promise.all(
      photos.map(async (photo: any) => {
        const imgPath = resolve(UPLOAD_DIR, photo.filename);
        // Get user drawings for ROI
        const drawings: any[] = db.prepare(
          'SELECT shape_data FROM drawings WHERE photo_id = ?'
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
    ),
  ]);

  // Task 4: Search official specs (depends on label extraction)
  let officialSpecs = undefined;
  if (labelInfo?.model_number) {
    officialSpecs = await searchOfficialSpecs(labelInfo, projectId);
  }

  // Task 5: Vehicle identification + dimension lookup (v0.7.0)
  // Runs across sampled project images; keeps partial official vehicle dimensions when available.
  let vehicle: VehicleIdentification | undefined;
  let vehicle_dimensions: PartialVehicleDimensions | undefined;
  try {
    const vehicleResult = await identifyVehicleFromImages(imagePaths, projectId);
    if (vehicleResult.found) {
      vehicle = vehicleResult as VehicleIdentification;
      vehicle_dimensions = await searchVehicleDimensionsPartial(vehicle, projectId);
      console.log(`[analyze] Vehicle identified: ${vehicle.make} ${vehicle.model}, dims: ${JSON.stringify(vehicle_dimensions)}`);
    }
  } catch (e: any) {
    console.warn('[analyze] Vehicle dimension lookup skipped:', e.message);
  }

  // Build results
  const aiResults: AnalysisResults = {
    ocr_readings: ocrResults,
    label_info: labelInfo,
    official_specs: officialSpecs,
    overlay_interpretation: undefined, // Set separately if overlay exists
    vehicle,
    vehicle_dimensions,
  };

  // Evaluate pipeline quality
  const quality = evaluateQuality({ ai: aiResults, opencv: opencvResults });
  if (quality.flagged_for_review) {
    console.warn('[analyze] Quality gate flagged for review:', quality.warnings);
  }

  // Store results in DB
  db.prepare(`
    INSERT INTO analysis_results (project_id, result_type, raw_response, parsed_data)
    VALUES (?, 'full_analysis', ?, ?)
  `).run(
    projectId,
    JSON.stringify({ ai: aiResults, opencv: opencvResults, quality, vehicle, vehicle_dimensions }),
    JSON.stringify({ ...aiResults, vehicle, vehicle_dimensions }),
  );

  return { ai: aiResults, opencv: opencvResults, quality, vehicle, vehicle_dimensions };
}
