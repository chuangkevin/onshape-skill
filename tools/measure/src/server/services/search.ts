import { callGemini, callGeminiWithApiKey } from '../geminiClient.js';
import type { LabelInfo, OfficialSpec, PartialVehicleDimensions, VehicleIdentification, VehicleDimensions } from '@shared/types.js';

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

// ── Vehicle identification ──────────────────────────────────────────────────

const VEHICLE_IDENTIFY_PROMPT = `You are analyzing a photo. Determine whether this is a vehicle photo, and if so identify the make, model, year and camera angle.

Respond ONLY with JSON, no other text:

If a vehicle IS visible:
{
  "found": true,
  "make": "Lamborghini",
  "model": "Urus",
  "year": 2023,
  "variant": "S",
  "view_angle": "side"
}

view_angle must be one of: "side", "front", "rear", "top", "three_quarter", "unknown"
year and variant may be null if not determinable.

If this is NOT a vehicle photo:
{"found": false}`;

const VEHICLE_DIMS_PROMPT = `Search for the official manufacturer specifications of this vehicle.

Vehicle: {year}{make} {model}{variant}

Return ONLY real, confirmed values from the official manufacturer spec sheet — in millimetres.
Do NOT guess or interpolate. If you cannot confirm a value, omit it.

Respond ONLY with JSON:
{
  "length_mm": 5112,
  "width_mm": 2016,
  "height_mm": 1638,
  "wheelbase_mm": 3003,
  "front_track_mm": 1720,
  "rear_track_mm": 1694
}

CRITICAL: If you cannot find the official specs, respond with:
{"error": "specs_not_found", "reason": "<explain why>"}
Do NOT fill in approximate or default values.`;

/**
 * Ask Gemini to identify the vehicle in an image.
 * Returns VehicleIdentification if a vehicle is present, or { found: false } otherwise.
 */
export async function identifyVehicle(
  imagePath: string,
  projectId?: number,
  preferredApiKey?: string,
  apiKeyOverride?: string,
): Promise<VehicleIdentification | { found: false }> {
  const request = {
    prompt: VEHICLE_IDENTIFY_PROMPT,
    imagePaths: [imagePath],
    callType: 'vehicle-identify',
    projectId,
  };
  const { text } = apiKeyOverride
    ? await callGeminiWithApiKey({ ...request, apiKey: apiKeyOverride })
    : await callGemini({ ...request, preferredApiKey });

  const parsed = parseJsonFromText(text);
  if (!parsed || !parsed.found) return { found: false };

  if (!parsed.make || !parsed.model) return { found: false };

  return {
    found: true as const,
    make: String(parsed.make),
    model: String(parsed.model),
    year: typeof parsed.year === 'number' ? parsed.year : undefined,
    variant: parsed.variant ? String(parsed.variant) : undefined,
    view_angle: (['side', 'front', 'rear', 'top', 'three_quarter', 'unknown'] as const).includes(parsed.view_angle)
      ? parsed.view_angle as VehicleIdentification['view_angle']
      : 'unknown' as const,
  };
}

export async function identifyVehicleFromImages(
  imagePaths: string[],
  projectId?: number,
  preferredApiKey?: string,
  apiKeyOverride?: string,
): Promise<VehicleIdentification | { found: false }> {
  const samples = sampleImages(imagePaths, 5);
  for (const imagePath of samples) {
    try {
      const result = await identifyVehicle(imagePath, projectId, preferredApiKey, apiKeyOverride);
      if (result.found) return result;
    } catch (err: any) {
      const status = Number(err?.status || 0);
      if (apiKeyOverride && (status === 429 || status >= 500 || status === 401 || status === 403 || status === 400)) {
        throw err;
      }
      console.warn(`[vehicle-identify] failed for ${imagePath}:`, err);
    }
  }
  return { found: false };
}

export function sampleVehicleImages(paths: string[], count: number = 5): string[] {
  return sampleImages(paths, count);
}

/**
 * Use Gemini with Google Search grounding to find official vehicle dimensions.
 * Throws an error if specs cannot be found — no fallback to default values.
 */
export async function searchVehicleDimensions(
  vehicle: VehicleIdentification,
  projectId?: number,
  preferredApiKey?: string,
  apiKeyOverride?: string,
): Promise<VehicleDimensions> {
  const yearPrefix = vehicle.year ? `${vehicle.year} ` : '';
  const variantSuffix = vehicle.variant ? ` ${vehicle.variant}` : '';
  const prompt = VEHICLE_DIMS_PROMPT
    .replace('{year}', yearPrefix)
    .replace('{make}', vehicle.make)
    .replace('{model}', vehicle.model)
    .replace('{variant}', variantSuffix);

  const request = {
    prompt,
    callType: 'vehicle-dims-search',
    projectId,
    useGrounding: true,
  };
  const { text } = apiKeyOverride
    ? await callGeminiWithApiKey({ ...request, apiKey: apiKeyOverride })
    : await callGemini({ ...request, preferredApiKey });

  const parsed = parseJsonFromText(text);
  if (!parsed) {
    throw new Error(`Vehicle dimension search for ${vehicle.make} ${vehicle.model}: Gemini returned unparseable response`);
  }

  if (parsed.error) {
    throw new Error(`Vehicle dimension search for ${vehicle.make} ${vehicle.model}: ${parsed.reason ?? parsed.error}`);
  }

  const length_mm = parsed.length_mm;
  const width_mm = parsed.width_mm;
  const height_mm = parsed.height_mm;

  if (typeof length_mm !== 'number' || typeof width_mm !== 'number' || typeof height_mm !== 'number') {
    throw new Error(
      `Vehicle dimension search for ${vehicle.make} ${vehicle.model}: missing required dimensions (length/width/height). ` +
      `Got: ${JSON.stringify(parsed)}`,
    );
  }

  const dims: VehicleDimensions = { length_mm, width_mm, height_mm };
  if (typeof parsed.wheelbase_mm === 'number') dims.wheelbase_mm = parsed.wheelbase_mm;
  if (typeof parsed.front_track_mm === 'number') dims.front_track_mm = parsed.front_track_mm;
  if (typeof parsed.rear_track_mm === 'number') dims.rear_track_mm = parsed.rear_track_mm;

  return dims;
}

export async function searchVehicleDimensionsPartial(
  vehicle: VehicleIdentification,
  projectId?: number,
  preferredApiKey?: string,
  apiKeyOverride?: string,
  requestedFields?: Array<keyof PartialVehicleDimensions>,
): Promise<PartialVehicleDimensions> {
  const yearPrefix = vehicle.year ? `${vehicle.year} ` : '';
  const variantSuffix = vehicle.variant ? ` ${vehicle.variant}` : '';
  const prompt = VEHICLE_DIMS_PROMPT
    .replace('{year}', yearPrefix)
    .replace('{make}', vehicle.make)
    .replace('{model}', vehicle.model)
    .replace('{variant}', variantSuffix)
    + (requestedFields && requestedFields.length > 0
      ? `

Only return these fields if confirmed: ${requestedFields.join(', ')}`
      : '');

  const request = {
    prompt,
    callType: 'vehicle-dims-search',
    projectId,
    useGrounding: true,
  };
  const { text } = apiKeyOverride
    ? await callGeminiWithApiKey({ ...request, apiKey: apiKeyOverride })
    : await callGemini({ ...request, preferredApiKey });

  const parsed = parseJsonFromText(text);
  if (!parsed) {
    throw new Error(`Vehicle dimension search for ${vehicle.make} ${vehicle.model}: Gemini returned unparseable response`);
  }
  if (parsed.error) {
    throw new Error(`Vehicle dimension search for ${vehicle.make} ${vehicle.model}: ${parsed.reason ?? parsed.error}`);
  }

  const dims: PartialVehicleDimensions = {};
  if (typeof parsed.length_mm === 'number') dims.length_mm = parsed.length_mm;
  if (typeof parsed.width_mm === 'number') dims.width_mm = parsed.width_mm;
  if (typeof parsed.height_mm === 'number') dims.height_mm = parsed.height_mm;
  if (typeof parsed.wheelbase_mm === 'number') dims.wheelbase_mm = parsed.wheelbase_mm;
  if (typeof parsed.front_track_mm === 'number') dims.front_track_mm = parsed.front_track_mm;
  if (typeof parsed.rear_track_mm === 'number') dims.rear_track_mm = parsed.rear_track_mm;

  if (Object.keys(dims).length === 0) {
    throw new Error(`Vehicle dimension search for ${vehicle.make} ${vehicle.model}: no confirmed dimensions returned`);
  }

  return dims;
}

function parseJsonFromText(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

function sampleImages(paths: string[], count: number): string[] {
  if (paths.length <= count) return paths;
  const step = (paths.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => paths[Math.round(i * step)]);
}
