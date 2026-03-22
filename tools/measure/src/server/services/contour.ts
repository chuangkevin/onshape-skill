import { callGemini } from '../geminiClient.js';
import { parseJsonFromText } from './ruler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeminiContourResult {
  found: boolean;
  contours: Array<{
    label?: string;
    contour_px: Array<{ x: number; y: number }>;
  }>;
  method: 'gemini';
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const CONTOUR_PROMPT = `\
You are analyzing a photo of a physical object placed on a surface.

Your task: Find the MAIN OBJECT in the image (not the ruler, not the background, not fingers, not the table) and return its outline as pixel coordinate points.

Instructions:
1. Identify the main physical object(s) in the image.
2. Trace the actual physical outline of each object as a series of (x, y) pixel coordinates, going clockwise starting from the top-left-most point.
3. The image origin (0,0) is at the top-left corner. x increases to the right, y increases downward.
4. Use 10-50 points for simple shapes (rectangles, circles), more for complex or irregular outlines.
5. Points should lie on the actual visible edge of the object, not a bounding box.

Respond ONLY with a single JSON object (no markdown, no explanation):

If object(s) found:
{"found":true,"contours":[{"label":"laptop battery","contour_px":[{"x":100,"y":50},{"x":800,"y":50},{"x":800,"y":300},{"x":100,"y":300}]}]}

If multiple distinct parts are visible, include all of them sorted by area (largest first).

If NO clear object is found:
{"found":false,"contours":[]}

IMPORTANT: respond ONLY with JSON, no markdown.`;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Send an image to Gemini and ask it to detect the contour (outline) of the
 * main physical object(s) in the scene.  Returns an array of contours, each
 * consisting of pixel-coordinate points that trace the object edge.
 */
export async function detectContourWithGemini(
  imagePath: string,
  projectId?: number,
): Promise<GeminiContourResult> {
  // --- Call Gemini ----------------------------------------------------------
  const { text } = await callGemini({
    prompt: CONTOUR_PROMPT,
    imagePaths: [imagePath],
    callType: 'contour-detection',
    projectId,
  });

  // --- Parse response -------------------------------------------------------
  let parsed: any;
  try {
    parsed = parseJsonFromText(text);
  } catch {
    console.error('[contour-gemini] Failed to parse Gemini response as JSON:', text);
    return { found: false, contours: [], method: 'gemini' };
  }

  // --- Validate -------------------------------------------------------------
  if (!parsed || parsed.found !== true) {
    return { found: false, contours: [], method: 'gemini' };
  }

  if (!Array.isArray(parsed.contours) || parsed.contours.length === 0) {
    console.error('[contour-gemini] Response has found:true but no contours:', parsed);
    return { found: false, contours: [], method: 'gemini' };
  }

  // Validate each contour has at least 3 points with numeric coordinates
  const validContours = parsed.contours.filter((c: any) => {
    if (!Array.isArray(c.contour_px) || c.contour_px.length < 3) return false;
    return c.contour_px.every(
      (pt: any) => typeof pt.x === 'number' && typeof pt.y === 'number',
    );
  });

  if (validContours.length === 0) {
    console.error('[contour-gemini] No contours with >= 3 valid points:', parsed);
    return { found: false, contours: [], method: 'gemini' };
  }

  console.log(`[contour-gemini] Detected ${validContours.length} contour(s)`);

  return {
    found: true,
    contours: validContours.map((c: any) => ({
      label: c.label as string | undefined,
      contour_px: c.contour_px.map((pt: any) => ({ x: pt.x, y: pt.y })),
    })),
    method: 'gemini',
  };
}
