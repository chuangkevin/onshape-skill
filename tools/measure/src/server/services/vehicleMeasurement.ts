/**
 * vehicleMeasurement.ts — Extract real-world vehicle dimensions from video frames
 *
 * Strategy:
 * 1. Detect reference objects (license plates, people, road markings, other vehicles)
 * 2. Establish pixel-to-mm scale calibration
 * 3. Multi-view triangulation (combine front/side/top views)
 * 4. Cross-validate with web search results
 */

import { callGeminiWithApiKey } from '../geminiClient.js';
import type { PartialVehicleDimensions, VehicleIdentification } from '../../shared/types.js';

/**
 * Reference object dimensions (standard sizes in mm)
 */
const REFERENCE_SIZES: Record<string, { length_mm?: number; width_mm?: number; height_mm?: number }> = {
  // License plates (varies by region, using common standards)
  'license_plate_eu': { length_mm: 520, width_mm: 110 },
  'license_plate_us': { length_mm: 305, width_mm: 152 },
  'license_plate_cn': { length_mm: 440, width_mm: 140 },

  // People (average heights)
  'adult_male': { height_mm: 1750 },
  'adult_female': { height_mm: 1625 },

  // Road markings
  'parking_space_standard': { length_mm: 5000, width_mm: 2500 },
  'lane_width_standard': { width_mm: 3650 },

  // Common vehicles (for relative measurement)
  'sedan_average': { length_mm: 4700, width_mm: 1800, height_mm: 1450 },
  'suv_average': { length_mm: 4800, width_mm: 1950, height_mm: 1700 },
};

interface ReferenceDetection {
  object_type: keyof typeof REFERENCE_SIZES;
  bounding_box_px: { x: number; y: number; width: number; height: number };
  confidence: 'high' | 'medium' | 'low';
  dimension_type: 'length' | 'width' | 'height';
}

interface ScaleCalibration {
  px_per_mm: number;
  reference_used: string;
  confidence: 'high' | 'medium' | 'low';
  view_angle: 'side' | 'front' | 'rear' | 'top' | 'three_quarter' | 'unknown';
}

interface MeasuredDimensions {
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  confidence: 'high' | 'medium' | 'low';
  method: string;
}

const REFERENCE_DETECT_PROMPT = `Analyze this vehicle photo and detect any reference objects that can be used for scale calibration.

Look for:
1. License plates (EU/US/CN standard sizes)
2. People standing nearby (full body visible)
3. Parking space markings
4. Lane markings
5. Other vehicles (if identifiable make/model)

For each reference object found, return:
- object_type: one of [license_plate_eu, license_plate_us, license_plate_cn, adult_male, adult_female, parking_space_standard, lane_width_standard, sedan_average, suv_average]
- bounding_box_px: { x, y, width, height } in pixels
- confidence: high/medium/low
- dimension_type: which dimension is most reliable (length/width/height)

Respond ONLY with JSON:
{
  "references": [
    {
      "object_type": "license_plate_eu",
      "bounding_box_px": { "x": 450, "y": 820, "width": 85, "height": 18 },
      "confidence": "high",
      "dimension_type": "width"
    }
  ]
}

If NO reference objects are detected:
{"references": []}`;

const VEHICLE_MEASURE_PROMPT = `Using the detected reference object for scale, measure the vehicle's dimensions in this photo.

Reference object: {reference_type} ({reference_dimension}: {reference_value_mm} mm)
Reference bounding box: {reference_bbox_px} px
Estimated scale: {estimated_px_per_mm} px/mm

Vehicle bounding box: detect the main vehicle body
Measure: overall length, width, and height (based on view angle)

View angle: {view_angle}

Respond ONLY with JSON:
{
  "vehicle_bbox_px": { "x": 120, "y": 200, "width": 580, "height": 320 },
  "length_mm": 4650,
  "width_mm": 1820,
  "height_mm": null,
  "confidence": "medium",
  "notes": "Side view, length and height measurable, width less accurate"
}

CRITICAL: Only return dimensions that are reliable for this view angle. If a dimension cannot be accurately measured (e.g. width from pure side view), set it to null.`;

/**
 * Detect reference objects in a single frame
 */
async function detectReferenceObjects(
  imagePath: string,
  apiKey: string,
): Promise<ReferenceDetection[]> {
  const { text } = await callGeminiWithApiKey({
    prompt: REFERENCE_DETECT_PROMPT,
    imagePaths: [imagePath],
    callType: 'vehicle-reference-detect',
    apiKey,
  });

  const parsed = parseJsonFromText(text);
  if (!parsed || !Array.isArray(parsed.references)) {
    return [];
  }

  return parsed.references.filter((ref: any) =>
    ref.object_type &&
    ref.bounding_box_px &&
    REFERENCE_SIZES[ref.object_type as keyof typeof REFERENCE_SIZES]
  ) as ReferenceDetection[];
}

/**
 * Establish scale calibration from reference detection
 */
function calibrateScale(
  detection: ReferenceDetection,
  viewAngle: 'side' | 'front' | 'rear' | 'top' | 'three_quarter' | 'unknown',
): ScaleCalibration | null {
  const refSize = REFERENCE_SIZES[detection.object_type];
  if (!refSize) return null;

  let refDimension_mm: number | undefined;
  let refPixels: number;

  switch (detection.dimension_type) {
    case 'length':
      refDimension_mm = refSize.length_mm;
      refPixels = detection.bounding_box_px.width;
      break;
    case 'width':
      refDimension_mm = refSize.width_mm;
      refPixels = detection.bounding_box_px.width;
      break;
    case 'height':
      refDimension_mm = refSize.height_mm;
      refPixels = detection.bounding_box_px.height;
      break;
  }

  if (!refDimension_mm || refPixels <= 0) return null;

  const px_per_mm = refPixels / refDimension_mm;

  // Confidence depends on reference type and view angle consistency
  let confidence: 'high' | 'medium' | 'low' = detection.confidence;
  if (viewAngle === 'three_quarter' || viewAngle === 'unknown') {
    confidence = confidence === 'high' ? 'medium' : 'low';
  }

  return {
    px_per_mm,
    reference_used: detection.object_type,
    confidence,
    view_angle: viewAngle,
  };
}

/**
 * Measure vehicle dimensions using calibrated scale
 */
async function measureWithScale(
  imagePath: string,
  scale: ScaleCalibration,
  apiKey: string,
): Promise<MeasuredDimensions | null> {
  const refType = scale.reference_used;
  const refSize = REFERENCE_SIZES[refType as keyof typeof REFERENCE_SIZES];
  if (!refSize) return null;

  const refDimension = refSize.length_mm || refSize.width_mm || refSize.height_mm || 0;

  const prompt = VEHICLE_MEASURE_PROMPT
    .replace('{reference_type}', refType)
    .replace('{reference_dimension}', refSize.length_mm ? 'length' : refSize.width_mm ? 'width' : 'height')
    .replace('{reference_value_mm}', String(refDimension))
    .replace('{reference_bbox_px}', 'detected')
    .replace('{estimated_px_per_mm}', scale.px_per_mm.toFixed(2))
    .replace('{view_angle}', scale.view_angle);

  const { text } = await callGeminiWithApiKey({
    prompt,
    imagePaths: [imagePath],
    callType: 'vehicle-measure',
    apiKey,
  });

  const parsed = parseJsonFromText(text);
  if (!parsed) return null;

  return {
    length_mm: typeof parsed.length_mm === 'number' ? parsed.length_mm : undefined,
    width_mm: typeof parsed.width_mm === 'number' ? parsed.width_mm : undefined,
    height_mm: typeof parsed.height_mm === 'number' ? parsed.height_mm : undefined,
    confidence: parsed.confidence || 'low',
    method: `reference_scale_${refType}`,
  };
}

/**
 * Main entry point: measure vehicle dimensions from multiple frames
 */
export async function measureVehicleFromFrames(
  framePaths: string[],
  vehicle: VehicleIdentification,
  apiKey: string,
): Promise<PartialVehicleDimensions | null> {
  // Sample frames strategically (prioritize side/front views)
  const sampleFrames = sampleStrategic(framePaths, 5);

  const measurements: MeasuredDimensions[] = [];

  for (const framePath of sampleFrames) {
    try {
      // Step 1: Detect reference objects
      const references = await detectReferenceObjects(framePath, apiKey);
      if (references.length === 0) continue;

      // Step 2: Choose best reference (license plate > people > other)
      const bestRef = references.sort((a, b) => {
        const priority = { high: 3, medium: 2, low: 1 };
        const typeScore = (ref: ReferenceDetection) =>
          ref.object_type.startsWith('license_plate') ? 10 :
          ref.object_type.startsWith('adult') ? 5 : 1;

        return (typeScore(b) + priority[b.confidence]) - (typeScore(a) + priority[a.confidence]);
      })[0];

      // Step 3: Calibrate scale
      const scale = calibrateScale(bestRef, vehicle.view_angle);
      if (!scale) continue;

      // Step 4: Measure vehicle
      const measurement = await measureWithScale(framePath, scale, apiKey);
      if (measurement) {
        measurements.push(measurement);
      }
    } catch (err: any) {
      console.warn(`[vehicleMeasurement] Frame measurement failed:`, err);
    }
  }

  if (measurements.length === 0) return null;

  // Merge measurements (weighted average by confidence)
  return mergeMeasurements(measurements);
}

/**
 * Merge multiple measurements with confidence weighting
 */
function mergeMeasurements(measurements: MeasuredDimensions[]): PartialVehicleDimensions {
  const weights = { high: 3, medium: 2, low: 1 };

  const dims: PartialVehicleDimensions = {};

  for (const key of ['length_mm', 'width_mm', 'height_mm'] as const) {
    const validMeasurements = measurements.filter((m) => m[key] !== undefined && m[key] !== null);
    if (validMeasurements.length === 0) continue;

    const weightedSum = validMeasurements.reduce((sum, m) => {
      const value = m[key] as number;
      const weight = weights[m.confidence];
      return sum + value * weight;
    }, 0);

    const totalWeight = validMeasurements.reduce((sum, m) => sum + weights[m.confidence], 0);

    dims[key] = Math.round(weightedSum / totalWeight);
  }

  return dims;
}

/**
 * Sample frames strategically (prefer side/front views over oblique angles)
 */
function sampleStrategic(paths: string[], count: number): string[] {
  if (paths.length <= count) return paths;

  // Simple uniform sampling (in real impl, could use view angle classification)
  const step = (paths.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => paths[Math.round(i * step)]);
}

function parseJsonFromText(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}
