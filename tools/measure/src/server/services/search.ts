import { callGemini } from '../geminiClient.js';
import type { LabelInfo, OfficialSpec } from '@shared/types.js';

const LABEL_PROMPT = `You are analyzing a photo of a product/component. Look for any visible text labels, model numbers, specifications printed on the item.

Extract:
1. model_number: The product model number/part number (e.g., "L17C3P53")
2. manufacturer: The manufacturer name (e.g., "Lenovo")
3. specs_text: Array of any specifications text visible (voltage, capacity, dimensions, etc.)

Respond ONLY with JSON, no other text:
{
  "model_number": "string or null",
  "manufacturer": "string or null",
  "specs_text": ["11.1V 3980mAh", "Lenovo (Thailand) Limited"]
}`;

const SEARCH_PROMPT = `Search for the official specifications of this product.

Product: {model_number} by {manufacturer}
Additional info: {specs_text}

Find and return the physical dimensions and other relevant specifications.
Respond ONLY with JSON:
{
  "length_mm": number or null,
  "width_mm": number or null,
  "height_mm": number or null,
  "weight_g": number or null,
  "other_specs": {}
}`;

export async function extractLabels(
  imagePaths: string[],
  projectId?: number,
): Promise<LabelInfo | undefined> {
  for (const imgPath of imagePaths) {
    try {
      const { text } = await callGemini({
        prompt: LABEL_PROMPT,
        imagePaths: [imgPath],
        callType: 'label-ocr',
        projectId,
      });

      const parsed = parseJsonFromText(text);
      if (parsed && (parsed.model_number || parsed.manufacturer)) {
        return {
          model_number: parsed.model_number || undefined,
          manufacturer: parsed.manufacturer || undefined,
          specs_text: parsed.specs_text || [],
        };
      }
    } catch (err) {
      console.error(`Label extraction failed for ${imgPath}:`, err);
    }
  }

  return undefined;
}

export async function searchOfficialSpecs(
  labelInfo: LabelInfo,
  projectId?: number,
): Promise<OfficialSpec | undefined> {
  if (!labelInfo.model_number) return undefined;

  const prompt = SEARCH_PROMPT
    .replace('{model_number}', labelInfo.model_number)
    .replace('{manufacturer}', labelInfo.manufacturer || 'unknown')
    .replace('{specs_text}', labelInfo.specs_text.join(', '));

  try {
    const { text } = await callGemini({
      prompt,
      callType: 'web-search',
      projectId,
      useGrounding: true,
    });

    const parsed = parseJsonFromText(text);
    if (!parsed) return undefined;

    const specs: OfficialSpec = {};
    if (parsed.length_mm) specs.length = parsed.length_mm;
    if (parsed.width_mm) specs.width = parsed.width_mm;
    if (parsed.height_mm) specs.height = parsed.height_mm;
    if (parsed.weight_g) specs.weight = parsed.weight_g;

    return Object.keys(specs).length > 0 ? specs : undefined;
  } catch (err) {
    console.error('Search failed:', err);
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
