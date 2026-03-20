import { callGemini } from '../geminiClient.js';
import type { OverlayInterpretation } from '@shared/types.js';

const OVERLAY_PROMPT = `You are analyzing a composite image: a photo of a physical part/component with a green overlay drawing on top. The overlay represents the user's hand-drawn contour tracing the edges of the part.

Analyze both the photo and the user's overlay drawing together:

1. Describe the overall shape the user has outlined (L-shape, rectangle, trapezoid, irregular polygon, etc.)
2. Estimate the key dimensions based on the overlay and any visible scale references
3. Identify any features the user may have marked (holes, tabs, connectors, slots)

Respond ONLY with JSON:
{
  "shape_description": "L-shaped battery body with raised control board section and mounting tabs",
  "estimated_dimensions": {
    "total_length_mm": 291,
    "main_body_height_mm": 73,
    "raised_section_height_mm": 81.5
  },
  "features_identified": [
    "3 mounting tabs on top edge",
    "2 mounting tabs on bottom edge",
    "cable connector on raised section"
  ]
}`;

export async function interpretOverlay(
  compositeImagePath: string,
  projectId?: number,
): Promise<OverlayInterpretation | undefined> {
  try {
    const { text } = await callGemini({
      prompt: OVERLAY_PROMPT,
      imagePaths: [compositeImagePath],
      callType: 'overlay-interpret',
      projectId,
    });

    const parsed = parseJsonFromText(text);
    if (!parsed) return undefined;

    return {
      shape_description: parsed.shape_description || '',
      estimated_dimensions: parsed.estimated_dimensions || {},
      features_identified: parsed.features_identified || [],
    };
  } catch (err) {
    console.error('Overlay interpretation failed:', err);
    return undefined;
  }
}

function parseJsonFromText(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}
