import type {
  MeasurementJSON, FusedView, FusedFeature, CaliperReading,
  OfficialSpec, OpenCVResult, AnalysisResults, Point,
  Confidence, MeasurementSource, ViewAngle,
} from '@shared/types.js';

interface PhotoMeasurement {
  filename: string;
  angle: ViewAngle;
  scale_px_per_mm?: number;
  user_contour_px?: Point[];
  user_features?: Array<{ type: string; center_px: Point; radius_px?: number; label: string }>;
  user_dimensions?: Array<{ location: string; value_mm: number }>;
  opencv_result?: OpenCVResult;
}

interface FusionInput {
  partName: string;
  photos: PhotoMeasurement[];
  aiResults: AnalysisResults;
}

/** Priority order: official_spec > opencv > user_drawing > gemini_vision */
const SOURCE_PRIORITY: Record<MeasurementSource, number> = {
  official_spec: 4,
  opencv: 3,
  user_drawing: 2,
  gemini_vision: 1,
};

/** Merge all measurement sources into a unified MeasurementJSON */
export function fuseMeasurements(input: FusionInput): MeasurementJSON {
  const { partName, photos, aiResults } = input;

  const views: FusedView[] = [];

  for (const photo of photos) {
    const view = fuseView(photo, aiResults);
    if (view) views.push(view);
  }

  // Caliper readings from OCR + user input
  const caliperReadings = fuseCaliperReadings(photos, aiResults);

  // Determine overall confidence
  const overall = determineOverallConfidence(views, caliperReadings, aiResults);

  return {
    part_name: partName,
    model_number: aiResults.label_info?.model_number ?? null,
    official_specs: aiResults.official_specs ?? {},
    views,
    caliper_readings: caliperReadings,
    confidence: { overall },
  };
}

function fuseView(photo: PhotoMeasurement, aiResults: AnalysisResults): FusedView | null {
  // Determine contour: OpenCV > user drawing > AI estimate
  let contour_mm: Point[] = [];
  let contourSource: MeasurementSource = 'gemini_vision';
  const scale = photo.scale_px_per_mm;

  // Priority 1: OpenCV contours
  if (photo.opencv_result && photo.opencv_result.contours.length > 0 && scale) {
    const largest = photo.opencv_result.contours[0]; // Already sorted by area
    contour_mm = largest.contour_px.map((p) => ({
      x: p.x / scale,
      y: p.y / scale,
    }));
    contourSource = 'opencv';
  }
  // Priority 2: User drawing
  else if (photo.user_contour_px && photo.user_contour_px.length > 0 && scale) {
    contour_mm = photo.user_contour_px.map((p) => ({
      x: p.x / scale,
      y: p.y / scale,
    }));
    contourSource = 'user_drawing';
  }

  // Override with official specs dimensions if available (adjust bounding box)
  if (aiResults.official_specs && Object.keys(aiResults.official_specs).length > 0) {
    // Keep contour shape but note official specs are available
    // The contour may not match official specs exactly — flag conflicts
  }

  // Fuse features
  const features = fuseFeatures(photo, scale);

  return {
    image: photo.filename,
    angle: photo.angle,
    scale_px_per_mm: scale ?? 0,
    contour_mm,
    features,
    source: contourSource,
  };
}

function fuseFeatures(photo: PhotoMeasurement, scale?: number): FusedFeature[] {
  const features: FusedFeature[] = [];

  // User-annotated features (priority 2)
  if (photo.user_features && scale) {
    for (const f of photo.user_features) {
      features.push({
        type: f.type as any,
        center_mm: { x: f.center_px.x / scale, y: f.center_px.y / scale },
        radius_mm: f.radius_px ? f.radius_px / scale : undefined,
        label: f.label,
        source: 'user_drawing',
        confidence: 'medium',
      });
    }
  }

  // OpenCV-detected circles (priority 3 — higher than user for geometry)
  if (photo.opencv_result && scale) {
    for (const c of photo.opencv_result.circles) {
      // Check if a user feature already covers this location
      const existing = features.find((f) => {
        const dx = f.center_mm.x - c.center_px.x / scale;
        const dy = f.center_mm.y - c.center_px.y / scale;
        return Math.sqrt(dx * dx + dy * dy) < 5; // Within 5mm
      });

      if (existing) {
        // OpenCV refines the user's annotation
        existing.center_mm = { x: c.center_px.x / scale, y: c.center_px.y / scale };
        existing.radius_mm = c.radius_px / scale;
        existing.source = 'opencv';
        existing.confidence = 'high';
      } else {
        features.push({
          type: 'hole',
          center_mm: { x: c.center_px.x / scale, y: c.center_px.y / scale },
          radius_mm: c.radius_px / scale,
          label: 'Detected hole',
          source: 'opencv',
          confidence: 'medium',
        });
      }
    }
  }

  return features;
}

function fuseCaliperReadings(
  photos: PhotoMeasurement[],
  aiResults: AnalysisResults,
): CaliperReading[] {
  const readings: CaliperReading[] = [];

  // From AI OCR
  for (const ocr of aiResults.ocr_readings) {
    readings.push({
      location: ocr.location,
      value_mm: ocr.unit === 'mm' ? ocr.value
        : ocr.unit === 'cm' ? ocr.value * 10
        : ocr.unit === 'inch' ? ocr.value * 25.4
        : ocr.value,
      source: 'gemini_vision',
      confidence: 'medium',
    });
  }

  // From user manual input
  for (const photo of photos) {
    if (photo.user_dimensions) {
      for (const dim of photo.user_dimensions) {
        // Check for conflict with OCR readings
        const existing = readings.find(
          (r) => r.location.toLowerCase() === dim.location.toLowerCase(),
        );
        if (existing) {
          // Check conflict (>5% difference)
          const diff = Math.abs(existing.value_mm - dim.value_mm) / existing.value_mm;
          if (diff > 0.05) {
            existing.confidence = 'low'; // Flag conflict
          }
          // User input overrides OCR
          existing.value_mm = dim.value_mm;
          existing.source = 'user_drawing';
          existing.confidence = diff > 0.05 ? 'low' : 'high';
        } else {
          readings.push({
            location: dim.location,
            value_mm: dim.value_mm,
            source: 'user_drawing',
            confidence: 'medium',
          });
        }
      }
    }
  }

  return readings;
}

function determineOverallConfidence(
  views: FusedView[],
  readings: CaliperReading[],
  aiResults: AnalysisResults,
): Confidence {
  let score = 0;
  let checks = 0;

  // Has official specs?
  if (aiResults.official_specs && Object.keys(aiResults.official_specs).length > 0) {
    score += 3;
    checks++;
  }

  // Has OpenCV contours?
  if (views.some((v) => v.source === 'opencv')) {
    score += 3;
    checks++;
  }

  // Has scale calibration?
  if (views.some((v) => v.scale_px_per_mm > 0)) {
    score += 2;
    checks++;
  }

  // Has caliper readings?
  if (readings.length > 0) {
    score += 2;
    checks++;
  }

  // Has user contours?
  if (views.some((v) => v.contour_mm.length > 0)) {
    score += 1;
    checks++;
  }

  if (checks === 0) return 'low';
  const avg = score / checks;
  if (avg >= 2.5) return 'high';
  if (avg >= 1.5) return 'medium';
  return 'low';
}

/** Detect conflicts between sources (>5% tolerance) */
export function detectConflicts(measurement: MeasurementJSON): Array<{
  field: string;
  source1: { source: string; value: number };
  source2: { source: string; value: number };
  diff_percent: number;
}> {
  const conflicts: Array<{
    field: string;
    source1: { source: string; value: number };
    source2: { source: string; value: number };
    diff_percent: number;
  }> = [];

  // Compare official specs vs measured contour bounding boxes
  if (measurement.official_specs && measurement.views.length > 0) {
    for (const view of measurement.views) {
      if (view.contour_mm.length < 3) continue;

      const xs = view.contour_mm.map((p) => p.x);
      const ys = view.contour_mm.map((p) => p.y);
      const measuredWidth = Math.max(...xs) - Math.min(...xs);
      const measuredHeight = Math.max(...ys) - Math.min(...ys);

      if (measurement.official_specs.length) {
        const diff = Math.abs(measuredWidth - measurement.official_specs.length) / measurement.official_specs.length;
        if (diff > 0.05) {
          conflicts.push({
            field: `${view.angle} view - length`,
            source1: { source: 'official_spec', value: measurement.official_specs.length },
            source2: { source: view.source, value: Math.round(measuredWidth * 10) / 10 },
            diff_percent: Math.round(diff * 100),
          });
        }
      }

      if (measurement.official_specs.width) {
        const diff = Math.abs(measuredHeight - measurement.official_specs.width) / measurement.official_specs.width;
        if (diff > 0.05) {
          conflicts.push({
            field: `${view.angle} view - width`,
            source1: { source: 'official_spec', value: measurement.official_specs.width },
            source2: { source: view.source, value: Math.round(measuredHeight * 10) / 10 },
            diff_percent: Math.round(diff * 100),
          });
        }
      }
    }
  }

  return conflicts;
}
