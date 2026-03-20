import { callGemini } from '../geminiClient.js';
import type { OCRReading } from '@shared/types.js';

const OCR_PROMPT = `You are analyzing a close-up photo of a measurement tool (digital caliper, ruler, or tape measure).

Extract ALL numeric readings visible in the image. For each reading:
1. The numeric value (as a number)
2. The unit (mm, cm, inch, etc.)
3. What is being measured (e.g., "thickness", "width", "length")

Respond ONLY with a JSON array, no other text:
[
  {"value": 27.8, "unit": "mm", "location": "caliper display - thickness"},
  {"value": 291, "unit": "mm", "location": "ruler - total length"}
]

If no measurements are visible, return an empty array: []`;

export async function extractOCRReadings(
  imagePaths: string[],
  projectId?: number,
): Promise<OCRReading[]> {
  const results: OCRReading[] = [];

  for (const imgPath of imagePaths) {
    try {
      const { text } = await callGemini({
        prompt: OCR_PROMPT,
        imagePaths: [imgPath],
        callType: 'ocr',
        projectId,
      });

      const parsed = parseJsonFromText(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item.value === 'number' && item.unit && item.location) {
            results.push({
              value: item.value,
              unit: item.unit,
              location: item.location,
              confidence: 'medium',
            });
          }
        }
      }
    } catch (err) {
      console.error(`OCR failed for ${imgPath}:`, err);
    }
  }

  return results;
}

function parseJsonFromText(text: string): any {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // Try extracting JSON from markdown code block
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }

  // Try finding array in text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {}
  }

  return null;
}
