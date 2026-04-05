import type { AnalysisResults, OpenCVResult, QualityReport } from '@shared/types.js';

// Configurable thresholds via environment variables
const OCR_MIN_READINGS = parseInt(process.env.OCR_MIN_READINGS ?? '1', 10);
const OCR_MAX_VALUE_MM = parseFloat(process.env.OCR_MAX_VALUE_MM ?? '10000');
const MEASUREMENT_DIVERGENCE_THRESHOLD = parseFloat(process.env.MEASUREMENT_DIVERGENCE_THRESHOLD ?? '0.2');
const QUALITY_FLAG_THRESHOLD = parseFloat(process.env.QUALITY_FLAG_THRESHOLD ?? '0.6');

const UNIT_PATTERN = /\b(mm|cm|m|in|inch|inches|ft)\b/i;

/** Score OCR result quality 0–1 based on structural heuristics */
function scoreOCR(ai: AnalysisResults): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  const readings = ai.ocr_readings ?? [];

  if (readings.length === 0) {
    warnings.push('No OCR measurements were extracted from the image');
    return { score: 0, warnings };
  }

  // Filter out out-of-range values
  const validReadings = readings.filter((r) => r.value > 0 && r.value <= OCR_MAX_VALUE_MM);
  const outOfRange = readings.length - validReadings.length;
  if (outOfRange > 0) {
    warnings.push(`${outOfRange} OCR reading(s) were out of the expected range (0–${OCR_MAX_VALUE_MM} mm) and excluded`);
  }

  if (validReadings.length < OCR_MIN_READINGS) {
    warnings.push(`Too few valid OCR measurements (got ${validReadings.length}, expected at least ${OCR_MIN_READINGS})`);
    return { score: 0.1, warnings };
  }

  // Check for units presence
  const hasUnits = readings.some((r) => r.unit && UNIT_PATTERN.test(r.unit));
  if (!hasUnits) {
    warnings.push('OCR readings have no measurement units — values may be unreliable');
  }

  // Score: base 0.6 for having readings, +0.2 for units, +0.2 for count ≥ 3
  let score = 0.6;
  if (hasUnits) score += 0.2;
  if (validReadings.length >= 3) score += 0.2;

  return { score: Math.min(1, score), warnings };
}

/** Score contour detection quality 0–1 */
function scoreContour(opencv: OpenCVResult[]): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  const hasContour = opencv.some((r) => r.contours.length > 0);

  if (!hasContour) {
    warnings.push('No object contour was detected — measurements derived from shape may be inaccurate');
    return { score: 0.2, warnings };
  }

  return { score: 0.9, warnings };
}

/** Cross-validate largest OCR measurement against largest contour bounding box dimension */
function crossValidate(ai: AnalysisResults, opencv: OpenCVResult[]): string[] {
  const warnings: string[] = [];

  const validReadings = (ai.ocr_readings ?? []).filter((r) => r.value > 0 && r.value <= OCR_MAX_VALUE_MM);
  if (validReadings.length === 0) return warnings;

  const largestOCR = Math.max(...validReadings.map((r) => r.value));

  // Find the largest contour bounding box dimension across all results
  let largestContourDim = 0;
  for (const result of opencv) {
    for (const contour of result.contours) {
      if (contour.bounding_box) {
        const dim = Math.max(contour.bounding_box.width, contour.bounding_box.height);
        if (dim > largestContourDim) largestContourDim = dim;
      }
    }
  }

  if (largestContourDim === 0) return warnings; // No contour to compare against

  // Compare: OCR is in mm, contour is in px — only compare relative divergence if they're in the same unit
  // We can only do this if scale calibration is known; without it, skip the cross-validation
  // (The types.ts OCRReading.value is in the unit from the label; contour is px — cannot compare directly)
  // Instead, use the simpler proxy: if official_specs exist, compare OCR to specs
  const officialSpecs = ai.official_specs;
  if (officialSpecs) {
    const specValues = Object.values(officialSpecs).filter((v): v is number => typeof v === 'number' && v > 0);
    if (specValues.length > 0) {
      const largestSpec = Math.max(...specValues);
      const divergence = Math.abs(largestOCR - largestSpec) / largestSpec;
      if (divergence > MEASUREMENT_DIVERGENCE_THRESHOLD) {
        warnings.push(
          `OCR measurement (${largestOCR.toFixed(1)} mm) diverges from official spec (${largestSpec.toFixed(1)} mm) ` +
          `by ${(divergence * 100).toFixed(0)}% — please verify manually`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Evaluate the quality of pipeline output and return a QualityReport.
 * This is a pure function — no side effects.
 */
export function evaluateQuality(result: { ai: AnalysisResults; opencv: OpenCVResult[] }): QualityReport {
  const { ai, opencv } = result;

  const ocrScore = scoreOCR(ai);
  const contourScore = scoreContour(opencv);
  const crossWarnings = crossValidate(ai, opencv);

  // Weighted average: OCR 60%, contour 40%
  const overall_confidence = ocrScore.score * 0.6 + contourScore.score * 0.4;

  const warnings = [...ocrScore.warnings, ...contourScore.warnings, ...crossWarnings];
  const flagged_for_review = overall_confidence < QUALITY_FLAG_THRESHOLD;

  return {
    overall_confidence,
    stage_scores: {
      contour: contourScore.score,
      ocr: ocrScore.score,
    },
    warnings,
    flagged_for_review,
  };
}
