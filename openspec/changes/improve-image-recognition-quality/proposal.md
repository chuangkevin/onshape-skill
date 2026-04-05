## Why

The image recognition pipeline produces unreliable measurements because it accepts low-confidence FastSAM contours as ground truth, relies on Gemini to generate pixel coordinates (which LLMs cannot do accurately), uses hardcoded Canny thresholds that fail on varying image conditions, and has no mechanism to warn users when output quality is insufficient. These flaws silently degrade measurement accuracy with no user feedback.

## What Changes

- **Remove** Gemini-based contour detection entirely — LLMs cannot reliably produce pixel coordinates; Gemini stays for OCR and semantic analysis only
- **Add** minimum confidence threshold filtering to FastSAM results (configurable, default 0.7); below threshold falls back to OpenCV-only contour
- **Replace** hardcoded Canny thresholds (30, 100) in `edge_detect.py` with adaptive Otsu-based thresholds computed per image
- **Increase** minimum contour area filter from 0.01% to 0.5% of image area to eliminate noise contours
- **Add** configurable `--min-contour-area` CLI parameter to `edge_detect.py`
- **Add** confidence scoring to OCR results based on Gemini response quality indicators
- **Add** cross-validation: if OCR measurement and contour-derived measurement diverge by >20%, flag as low confidence
- **Add** `QualityGate` module that evaluates each pipeline stage and surfaces warnings to the user when measurements may be inaccurate
- All thresholds are configurable via environment variables or request parameters — no magic numbers baked in

## Capabilities

### New Capabilities
- `contour-confidence-filtering`: FastSAM confidence threshold filtering with configurable minimum; graceful fallback to OpenCV when threshold not met
- `adaptive-edge-detection`: Otsu-based adaptive Canny thresholds and configurable minimum contour area in edge_detect.py
- `measurement-quality-gate`: Pipeline quality evaluation — OCR confidence scoring, cross-validation between OCR and contour measurements, user-facing warnings when confidence is below threshold

### Modified Capabilities
- None — removing Gemini contour is an implementation detail, not a spec-level requirement change; contour detection spec will be newly created under the new capabilities

## Impact

- `packages/server/src/services/contour.ts`: Remove `detectContourWithGemini`, `GeminiContourResult`, `buildContourPrompt`; add confidence filtering in `detectContourWithFastSAM`
- `packages/server/python/edge_detect.py`: Adaptive Canny thresholds, configurable min contour area
- `packages/server/src/services/analyze.ts`: Integrate `QualityGate`; attach confidence scores and warnings to pipeline output
- New file: `packages/server/src/services/qualityGate.ts`
- `shared/types.ts`: Extend result types with `confidence` and `quality_warnings` fields
- No API contract changes — warnings surface as additional fields in existing response shape
