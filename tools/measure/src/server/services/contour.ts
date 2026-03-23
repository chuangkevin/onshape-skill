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
Analyze this photo. Find the MAIN physical object (ignore rulers, fingers, table, background).

Trace its outline as 20-80 coordinate points along the ACTUAL visible edge — not a bounding box.
Follow the real shape: notches, tabs, connectors, curves, indentations.
Place more points at corners/curves, fewer on straight edges.
Clockwise from top-left. Pixel coordinates (origin top-left, x→right, y→down).

Reply with ONLY JSON, no markdown:
{"found":true,"contours":[{"label":"name","contour_px":[{"x":10,"y":20},{"x":50,"y":20},{"x":55,"y":25},{"x":55,"y":80},{"x":10,"y":80}]}]}

If no object: {"found":false,"contours":[]}`;

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

  // Subsample if too many points (Gemini sometimes generates hundreds)
  const MAX_POINTS = 200;
  const processedContours = validContours.map((c: any) => {
    let points: Array<{ x: number; y: number }> = c.contour_px.map((pt: any) => ({ x: pt.x, y: pt.y }));
    if (points.length > MAX_POINTS) {
      const step = points.length / MAX_POINTS;
      points = Array.from({ length: MAX_POINTS }, (_, i) => points[Math.floor(i * step)]);
      console.log(`[contour-gemini] Subsampled ${c.contour_px.length} → ${MAX_POINTS} points`);
    }
    return { label: c.label as string | undefined, contour_px: points };
  });

  console.log(`[contour-gemini] Detected ${processedContours.length} contour(s), points: ${processedContours.map((c: { contour_px: number[][] }) => c.contour_px.length).join(',')}`);

  return {
    found: true,
    contours: processedContours,
    method: 'gemini',
  };
}
