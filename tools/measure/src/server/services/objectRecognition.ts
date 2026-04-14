/**
 * objectRecognition.ts
 *
 * AI-powered object identification and feature extraction from video frames.
 * Uses Gemini Vision (gemini-2.5-flash via the existing callGemini key-pool).
 *
 * Pipeline:
 *  1. identifyObject()       — what is this object?
 *  2. extractFeatures()      — extract all visible dimensions per frame, then merge
 *  3. searchMissingDimensions() — Gemini + Google Search grounding for unknown dims
 */

import { callGemini } from '../geminiClient.js';
import type {
  ExtractedFeature,
  ObjectIdentification,
  PartialVehicleDimensions,
  VehicleIdentification,
  VideoAnalysisResult,
} from '../../shared/types.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(text: string, fallback: T): T {
  // Strip markdown code fences that Gemini sometimes emits
  const cleaned = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ── Step 1: Object Identification ────────────────────────────────────────────

/**
 * Feed the first few frames to Gemini and ask it to identify the object.
 * Returns object type, common name, and any visible label / model number.
 */
export async function identifyObject(
  framePaths: string[],
  projectId?: number,
): Promise<ObjectIdentification> {
  // Use at most 5 well-spaced frames for the identification call
  const samplePaths = sampleFrames(framePaths, 5);

  const prompt = `You are a mechanical/engineering expert. Examine the images (frames from a video or a set of photos of the same object).

Identify the object and respond with ONLY a JSON object in this exact schema:
{
  "object_type": "car | mechanical_part | electronics | tool | appliance | furniture | other",
  "common_name": "short human-readable name, e.g. 'laptop battery'",
  "model_number": "if visible on label, else null",
  "manufacturer": "if visible, else null",
  "description": "2-3 sentence description of the object and its key physical characteristics",
  "estimated_size_class": "tiny (<5cm) | small (5-20cm) | medium (20-50cm) | large (50-200cm) | vehicle (>200cm)"
}

Return only valid JSON, no extra text.`;

  const { text } = await callGemini({
    prompt,
    imagePaths: samplePaths,
    callType: 'video_identify_object',
    projectId,
  });

  const parsed = parseJson<Partial<ObjectIdentification>>(text, {});
  return {
    object_type: parsed.object_type ?? 'other',
    common_name: parsed.common_name ?? 'Unknown object',
    model_number: parsed.model_number ?? null,
    manufacturer: parsed.manufacturer ?? null,
    description: parsed.description ?? '',
    estimated_size_class: parsed.estimated_size_class ?? 'medium',
  };
}

// ── Step 2: Feature Extraction ────────────────────────────────────────────────

/**
 * For each frame, extract all visible measurable features.
 * Results across frames are merged and de-duplicated.
 */
export async function extractFeatures(
  framePaths: string[],
  objectInfo: ObjectIdentification,
  projectId?: number,
): Promise<ExtractedFeature[]> {
  // Process frames in batches of up to 4 images per Gemini call
  const BATCH = 4;
  const allFeatures: ExtractedFeature[] = [];

  for (let i = 0; i < framePaths.length; i += BATCH) {
    const batch = framePaths.slice(i, i + BATCH);
    const features = await extractFeaturesFromBatch(batch, objectInfo, projectId);
    allFeatures.push(...features);
  }

  return mergeFeatures(allFeatures);
}

async function extractFeaturesFromBatch(
  framePaths: string[],
  objectInfo: ObjectIdentification,
  projectId?: number,
): Promise<ExtractedFeature[]> {
  const prompt = `You are a precision metrology expert analyzing images of: ${objectInfo.common_name} (${objectInfo.object_type}).
${objectInfo.description}

Extract ALL visible measurable features and dimensions from these images.
For each feature you can see, provide an entry in the following JSON array schema:

[
  {
    "feature_name": "short name, e.g. 'overall length', 'mounting hole diameter', 'connector width'",
    "feature_type": "dimension | hole | slot | connector | thread | radius | angle | other",
    "view": "top | front | side | back | close-up | unknown",
    "value_mm": <estimated value in millimetres as a number, or null if not determinable>,
    "value_unit": "mm | cm | m | inch | null",
    "confidence": "high | medium | low",
    "notes": "any relevant context, e.g. 'measured at widest point', 'approximate'"
  }
]

Rules:
- Only include features you can actually see in the images
- If the size class is '${objectInfo.estimated_size_class}', calibrate estimates accordingly
- Prioritise visible ruler/scale markings for absolute values
- If no scale reference is visible, mark confidence as "low"
- Return only the JSON array, no extra text`;

  const { text } = await callGemini({
    prompt,
    imagePaths: framePaths,
    callType: 'video_extract_features',
    projectId,
  });

  const parsed = parseJson<Partial<ExtractedFeature>[]>(text, []);
  return parsed
    .filter((f) => f && f.feature_name)
    .map((f, idx) => ({
      id: `feat_${Date.now()}_${idx}`,
      feature_name: f.feature_name ?? 'Unknown feature',
      feature_type: f.feature_type ?? 'dimension',
      view: f.view ?? 'unknown',
      value_mm: f.value_mm ?? null,
      value_unit: f.value_unit ?? 'mm',
      confidence: f.confidence ?? 'low',
      notes: f.notes ?? '',
      source: 'gemini_vision' as const,
    }));
}

// ── Step 3: Web Search for Missing Dimensions ────────────────────────────────

/**
 * For features where value_mm is null or confidence is "low",
 * use Gemini with Google Search grounding to find official specs.
 */
export async function searchMissingDimensions(
  features: ExtractedFeature[],
  objectInfo: ObjectIdentification,
  projectId?: number,
): Promise<ExtractedFeature[]> {
  const missingCount = features.filter(
    (f) => f.value_mm === null || f.confidence === 'low',
  ).length;

  if (missingCount === 0) return features;

  const missingNames = features
    .filter((f) => f.value_mm === null || f.confidence === 'low')
    .map((f) => f.feature_name)
    .join(', ');

  const modelRef = objectInfo.model_number
    ? ` (model: ${objectInfo.model_number})`
    : '';
  const mfgRef = objectInfo.manufacturer ? ` by ${objectInfo.manufacturer}` : '';

  const prompt = `I have a ${objectInfo.common_name}${mfgRef}${modelRef}.

I need the following dimensions from official specifications or datasheets:
${missingNames}

Please search for the official datasheet or product specifications and provide the exact dimensions in millimetres.

Respond ONLY with a JSON array:
[
  {
    "feature_name": "exact name matching one of the requested dimensions above",
    "value_mm": <value as number>,
    "source_url": "URL where you found this, or null",
    "confidence": "high | medium | low"
  }
]

Return only the JSON array, no extra text.`;

  const { text } = await callGemini({
    prompt,
    callType: 'video_search_dimensions',
    projectId,
    useGrounding: true,
  });

  const searchResults = parseJson<Array<{
    feature_name: string;
    value_mm: number | null;
    source_url?: string | null;
    confidence?: string;
  }>>(text, []);

  // Merge search results into existing features
  const updated = features.map((f) => {
    const match = searchResults.find(
      (r) => r.feature_name.toLowerCase() === f.feature_name.toLowerCase(),
    );
    if (match && match.value_mm != null) {
      return {
        ...f,
        value_mm: match.value_mm,
        confidence: (match.confidence as ExtractedFeature['confidence']) ?? 'medium',
        notes: [f.notes, match.source_url ? `Source: ${match.source_url}` : '']
          .filter(Boolean)
          .join(' | '),
        source: 'web_search' as const,
      };
    }
    return f;
  });

  return updated;
}

// ── Step 4: Build Final Result ────────────────────────────────────────────────

export function buildAnalysisResult(
  objectInfo: ObjectIdentification,
  features: ExtractedFeature[],
  vehicle?: VehicleIdentification,
  vehicle_dimensions?: PartialVehicleDimensions,
): VideoAnalysisResult {
  const highConf = features.filter((f) => f.confidence === 'high').length;
  const total = features.length;
  const overallConfidence: VideoAnalysisResult['overall_confidence'] =
    total === 0 ? 'low'
      : highConf / total > 0.6 ? 'high'
      : highConf / total > 0.3 ? 'medium'
      : 'low';

  return {
    object: objectInfo,
    features,
    overall_confidence: overallConfidence,
    feature_count: total,
    modelling_ready: features.some((f) => f.value_mm !== null && f.confidence !== 'low'),
    vehicle,
    vehicle_dimensions,
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Pick N evenly-spaced frames from the list */
function sampleFrames(paths: string[], n: number): string[] {
  if (paths.length <= n) return paths;
  const step = (paths.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => paths[Math.round(i * step)]);
}

/**
 * Merge features from multiple batches.
 * Deduplicates by feature_name (case-insensitive), keeping the highest-confidence entry.
 */
function mergeFeatures(features: ExtractedFeature[]): ExtractedFeature[] {
  const map = new Map<string, ExtractedFeature>();
  const order: Record<string, number> = { high: 3, medium: 2, low: 1 };

  for (const feat of features) {
    const key = feat.feature_name.toLowerCase().trim();
    const existing = map.get(key);
    if (!existing || (order[feat.confidence] ?? 0) > (order[existing.confidence] ?? 0)) {
      map.set(key, feat);
    }
  }

  return Array.from(map.values());
}
