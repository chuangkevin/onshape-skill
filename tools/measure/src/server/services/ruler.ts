import { callGemini } from '../geminiClient.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RulerPoint {
  px_x: number;
  px_y: number;
  label: string;
}

interface RulerDetectionResult {
  found: boolean;
  point_a?: RulerPoint;
  point_b?: RulerPoint;
  distance_mm?: number;
  px_per_mm?: number;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const RULER_DETECTION_PROMPT = `\
You are analyzing a photo that may contain a ruler, tape measure, or caliper alongside a physical object.

Your task: Find any scale reference (ruler, tape measure, caliper) in the image and determine its pixel coordinates.

Instructions:
1. Look for a ruler, tape measure, or caliper in the image.
2. Identify two clear, readable markings on the scale (e.g., "0" and "30" on a ruler, or the jaws of a caliper).
3. Estimate the pixel coordinates (x, y) of each marking's position in the image.
   - The image origin (0,0) is at the top-left corner.
   - x increases to the right, y increases downward.
4. Calculate the real-world distance between the two markings in millimetres.

IMPORTANT:
- Pick markings that are as far apart as possible for maximum accuracy.
- Pixel coordinates should be approximate positions in the original image resolution.

Respond ONLY with a single JSON object (no markdown, no explanation):

If a ruler / scale / caliper IS found:
{"found":true,"point_a":{"px_x":123,"px_y":456,"label":"0 cm"},"point_b":{"px_x":789,"px_y":456,"label":"30 cm"},"distance_mm":300}

If NO ruler / scale / caliper is found:
{"found":false}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from text that may be wrapped in markdown code fences
 * (```json ... ```) or contain surrounding prose.
 */
export function parseJsonFromText(text: string): unknown {
  // 1. Try to extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // 2. Try to find a top-level JSON object in the text
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }

  // 3. Last resort – parse the whole string
  return JSON.parse(text.trim());
}

/**
 * Clamp a coordinate so it stays within [0, max).
 */
function clampCoord(value: number, max: number): number {
  return Math.max(0, Math.min(value, max - 1));
}

/**
 * Euclidean pixel distance between two points.
 */
function pixelDistance(a: RulerPoint, b: RulerPoint): number {
  const dx = b.px_x - a.px_x;
  const dy = b.px_y - a.px_y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Send an image to Gemini and ask it to locate a ruler / tape measure /
 * caliper.  Returns the two reference points, their real-world distance in mm,
 * and the derived px_per_mm scale factor.
 */
// ---------------------------------------------------------------------------
// Object bounding box detection
// ---------------------------------------------------------------------------

const BBOX_PROMPT = `\
You are analyzing a photo of a physical object placed on a surface, possibly with a ruler nearby.

Your task: Return the bounding box of the SINGLE PRIMARY OBJECT that is the clear subject of the photo.

Rules:
- Pick exactly ONE object — the most prominent one (e.g. the keyboard, the battery, the part being measured)
- Exclude: ruler/measuring tape, table/surface, hands, background objects, accessories placed nearby
- If multiple separate objects exist, pick only the ONE that is most clearly the subject (usually the largest, most centered dark object)
- The bbox must tightly enclose ONLY that one object — do not include nearby objects even if they look related

The image origin (0,0) is at the top-left. x increases right, y increases down.

Respond ONLY with JSON:
{"found":true,"x":100,"y":50,"width":800,"height":400,"description":"ThinkPad keyboard"}

If no clear single object is found:
{"found":false}`;

export interface BBoxResult {
  found: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  description?: string;
}

export async function detectObjectBBox(
  imagePath: string,
  projectId?: number,
): Promise<BBoxResult> {
  try {
    const { text } = await callGemini({
      prompt: BBOX_PROMPT,
      imagePaths: [imagePath],
      callType: 'bbox-detection',
      projectId,
    });

    const parsed: any = parseJsonFromText(text);
    if (!parsed || !parsed.found) return { found: false };

    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' ||
        typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return { found: false };
    }

    return {
      found: true,
      x: Math.max(0, parsed.x),
      y: Math.max(0, parsed.y),
      width: parsed.width,
      height: parsed.height,
      description: parsed.description,
    };
  } catch (e) {
    console.error('[bbox] Detection failed:', e);
    return { found: false };
  }
}

export async function detectRuler(
  imagePath: string,
  projectId?: number,
): Promise<RulerDetectionResult> {
  // --- Call Gemini --------------------------------------------------------
  const { text } = await callGemini({
    prompt: RULER_DETECTION_PROMPT,
    imagePaths: [imagePath],
    callType: 'ruler-detection',
    projectId,
  });

  // --- Parse response -----------------------------------------------------
  let parsed: any;
  try {
    parsed = parseJsonFromText(text);
  } catch {
    console.error('[ruler] Failed to parse Gemini response as JSON:', text);
    return { found: false };
  }

  if (!parsed || parsed.found !== true) {
    return { found: false };
  }

  // --- Validate -----------------------------------------------------------
  const { point_a, point_b, distance_mm } = parsed;

  if (
    !point_a || !point_b ||
    typeof point_a.px_x !== 'number' || typeof point_a.px_y !== 'number' ||
    typeof point_b.px_x !== 'number' || typeof point_b.px_y !== 'number' ||
    typeof distance_mm !== 'number' || distance_mm <= 0
  ) {
    console.error('[ruler] Invalid fields in Gemini response:', parsed);
    return { found: false };
  }

  // Use reasonable default image bounds when actual dimensions are unknown.
  const MAX_W = 4000;
  const MAX_H = 3000;

  const a: RulerPoint = {
    px_x: clampCoord(point_a.px_x, MAX_W),
    px_y: clampCoord(point_a.px_y, MAX_H),
    label: String(point_a.label ?? ''),
  };

  const b: RulerPoint = {
    px_x: clampCoord(point_b.px_x, MAX_W),
    px_y: clampCoord(point_b.px_y, MAX_H),
    label: String(point_b.label ?? ''),
  };

  const pxDist = pixelDistance(a, b);
  if (pxDist === 0) {
    console.error('[ruler] Two points are identical – cannot compute scale.');
    return { found: false };
  }

  const px_per_mm = pxDist / distance_mm;

  return {
    found: true,
    point_a: a,
    point_b: b,
    distance_mm,
    px_per_mm,
  };
}
