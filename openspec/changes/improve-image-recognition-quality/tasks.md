## 1. Remove Gemini Contour Detection

- [x] 1.1 Delete `detectContourWithGemini`, `GeminiContourResult`, `buildContourPrompt` from `contour.ts`
- [x] 1.2 Remove `GeminiContourResult` export and any re-exports from `contour.ts`
- [x] 1.3 Search for all callers of `detectContourWithGemini` across the codebase and remove or replace with OpenCV fallback

## 2. FastSAM Confidence Threshold Filtering

- [x] 2.1 Read `FASTSAM_MIN_CONFIDENCE` env var at module init in `contour.ts` (default `0.7`)
- [x] 2.2 In `detectContourWithFastSAM`, after normalizing contours, filter out any with `confidence < threshold`
- [x] 2.3 Treat contours with no `confidence` field as confidence `0` (discard them)
- [x] 2.4 Return `{ found: false }` if all contours are filtered out after threshold check

## 3. Adaptive Canny Thresholds in edge_detect.py

- [x] 3.1 After CLAHE + blur, compute Otsu threshold: `_, otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)`
- [x] 3.2 Derive `low = max(30, 0.5 * otsu_value)`, `high = max(60, otsu_value)` and pass to `cv2.Canny(blurred, low, high)`
- [x] 3.3 Remove hardcoded `cv2.Canny(blurred, 30, 100)`

## 4. Configurable Min Contour Area in edge_detect.py

- [x] 4.1 Add `--min-contour-area` CLI arg (float, default `0.005`) to `edge_detect.py`
- [x] 4.2 Replace `min_area = img.shape[0] * img.shape[1] * 0.0001` with `min_area = img.shape[0] * img.shape[1] * min_contour_area_ratio`
- [x] 4.3 Pass `min_contour_area_ratio` through the `detect_edges()` function signature

## 5. Default Max-Size to 2048

- [x] 5.1 Set `max_size = 2048` as the default in `detect_edges()` when `--max-size` is not provided
- [x] 5.2 Update the CLI arg parsing to set `max_size = 2048` when `--max-size` flag is absent

## 6. Update opencv.ts Caller

- [x] 6.1 In `packages/server/src/services/opencv.ts`, update the `edge_detect.py` spawn call to pass `--min-contour-area` if needed
- [x] 6.2 Verify `--max-size` is not being passed explicitly (will now default to 2048 in Python)

## 7. Create QualityGate Module

- [x] 7.1 Create `packages/server/src/services/qualityGate.ts` with `QualityReport` interface and `evaluateQuality()` function
- [x] 7.2 Implement OCR confidence scorer: count numeric readings, check units presence, check value range (0–`OCR_MAX_VALUE_MM` env, default 10000)
- [x] 7.3 Implement contour confidence scorer: `found = 0.9`, `not found = 0.2`
- [x] 7.4 Implement cross-validation: compare largest OCR value to largest contour bbox dimension; warn if divergence > `MEASUREMENT_DIVERGENCE_THRESHOLD` env (default `0.2`)
- [x] 7.5 Compute `overall_confidence` as weighted average of stage scores (contour 40%, OCR 60%)
- [x] 7.6 Set `flagged_for_review = true` when `overall_confidence < 0.6` (configurable via `QUALITY_FLAG_THRESHOLD` env, default `0.6`)

## 8. Integrate QualityGate into analyze.ts

- [x] 8.1 Extend `FullAnalysisResult` with `quality: QualityReport` field
- [x] 8.2 After pipeline completes, call `evaluateQuality({ ai, opencv })` and attach result to response
- [x] 8.3 Include `quality` in the stored DB JSON blob

## 9. Extend Shared Types

- [x] 9.1 Add `QualityReport` interface to `shared/types.ts`
- [x] 9.2 Add `quality?: QualityReport` to `FullAnalysisResult` or equivalent shared type if it exists there

## 10. Verification

- [x] 10.1 Run `npm run build` (or equivalent) in `tools/measure` — no TypeScript errors
- [x] 10.2 Verify `detectContourWithGemini` is not present anywhere via grep
- [x] 10.3 Test edge_detect.py with a sample image: confirm adaptive Canny thresholds are used and contour count is reduced vs. old behavior
- [x] 10.4 Test FastSAM path: set `FASTSAM_MIN_CONFIDENCE=0.9` and confirm low-confidence contours are rejected
- [x] 10.5 Bump version in `package.json` to `0.2.0`
