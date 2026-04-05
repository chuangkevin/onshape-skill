## Context

The onshape-skill photo measurement pipeline has three detection layers: FastSAM (ML segmentation), Gemini Vision (LLM contour tracing), and OpenCV Canny (classical CV). Current problems:

1. FastSAM returns contours without confidence filtering — any detection, however weak, is accepted
2. Gemini contour detection asks an LLM to produce pixel coordinates, which is fundamentally unreliable — LLMs hallucinate coordinates
3. OpenCV Canny uses hardcoded thresholds (30, 100) and a 0.01% minimum area that accepts noise as valid contours
4. The pipeline has no quality gates — bad results flow silently to the user

The `analyze.ts` pipeline orchestrates these services but has no cross-validation or confidence aggregation.

## Goals / Non-Goals

**Goals:**
- Remove Gemini from contour detection — keep it only for OCR and semantic tasks
- Filter FastSAM results by confidence threshold (configurable, env-overridable)
- Make OpenCV edge detection adaptive: Otsu-based Canny thresholds, configurable minimum contour area
- Add a `QualityGate` service that scores pipeline output and attaches warnings to results
- Surface quality warnings in the API response so the frontend can show them to users
- All thresholds configurable — no magic numbers in code

**Non-Goals:**
- Retraining FastSAM or changing its model
- Adding a new ML backend (YOLO, SAM 2, etc.)
- Frontend UI changes for displaying warnings (warnings are added to response; UI wires them separately)
- Changing the database schema beyond adding `quality_score` and `quality_warnings` to the stored result JSON

## Decisions

### Decision 1: Remove Gemini contour, not just deprioritize it

**Chosen**: Delete `detectContourWithGemini`, `GeminiContourResult`, and `buildContourPrompt` from `contour.ts`.

**Rationale**: Keeping dead code with "disabled" flags creates confusion and maintenance burden. LLMs cannot reliably produce pixel coordinates — this is a category error, not a tuning problem. No fallback to Gemini contour should exist.

**Alternative considered**: Keep Gemini as last-resort fallback → rejected because a bad contour is worse than no contour (silently wrong measurements).

---

### Decision 2: FastSAM confidence threshold — configurable via env, not hardcoded

**Chosen**: `FASTSAM_MIN_CONFIDENCE` env var (default `0.7`). Read once at module init. Applied in `detectContourWithFastSAM` — contours below threshold are dropped, and if no contours remain after filtering, `found: false` is returned so the caller falls back to OpenCV.

**Rationale**: Different deployment environments have different image quality. The default of 0.7 is a reasonable starting point but must be tunable without code changes.

**Alternative considered**: Per-request confidence parameter → adds API surface complexity; env var is sufficient for a home server deployment.

---

### Decision 3: Adaptive Canny thresholds via Otsu

**Chosen**: Compute Otsu threshold on the blurred grayscale image, then derive `low = 0.5 * otsu`, `high = otsu`. This is a well-established adaptive approach.

**Rationale**: Hardcoded (30, 100) fails on images with different lighting and contrast. Otsu adapts to the actual image histogram.

**Alternative considered**: Median-based thresholds (33%/67% of median) → similar effect, slightly less principled; Otsu is standard for this use case.

---

### Decision 4: Minimum contour area — raise default from 0.01% to 0.5%, make configurable

**Chosen**: Default `MIN_CONTOUR_AREA_RATIO = 0.005` (0.5%). Exposed as `--min-contour-area` CLI param (as a ratio float). Caller in `opencv.ts` can pass it as needed.

**Rationale**: 0.01% on a 4000×3000 image allows contours of 120px² — pure noise. 0.5% = 60,000px² which is a realistic minimum for a mechanical part.

---

### Decision 5: QualityGate as a standalone module, not inline checks

**Chosen**: New file `packages/server/src/services/qualityGate.ts` with a pure function `evaluateQuality(pipelineResult) → QualityReport`.

**Rationale**: Keeps `analyze.ts` as an orchestrator; testable in isolation; quality logic can evolve without touching pipeline orchestration.

**QualityReport shape**:
```typescript
interface QualityReport {
  overall_confidence: number;       // 0-1
  stage_scores: {
    contour: number;
    ocr: number;
  };
  warnings: string[];               // Human-readable, shown to user
  flagged_for_review: boolean;      // true if any confidence < threshold
}
```

---

### Decision 6: OCR confidence scoring

**Chosen**: Score OCR confidence based on: (a) number of numeric values extracted, (b) presence of units, (c) value range sanity check (reject readings <0 or >10000mm). Produce a `0-1` score.

**Rationale**: Gemini's OCR text response doesn't include a confidence field. Structural heuristics are the practical alternative without a secondary validation model.

---

### Decision 7: Cross-validation — OCR vs contour bounding box

**Chosen**: If both OCR measurements and contour bounding box dimensions are available, compare largest OCR reading to largest contour dimension. If they diverge by >20% (configurable via `MEASUREMENT_DIVERGENCE_THRESHOLD` env, default `0.2`), add a warning.

**Rationale**: Catches the common failure mode where OCR reads an unrelated label or the contour misses part of the object.

## Risks / Trade-offs

- [Otsu thresholds on high-noise images] → Otsu can underperform on bimodal-histogram images with many gray midtones. Mitigation: apply CLAHE before Otsu (already done), and keep epsilon/blur parameters tunable.
- [Raising min contour area may miss small parts] → 0.5% is aggressive for macro close-ups. Mitigation: make it configurable per-request; ROI-cropped images will have a proportionally smaller threshold applied to the cropped region.
- [Removing Gemini contour removes a fallback] → When both FastSAM and Gemini contour failed, the pipeline still had something. After removal, OpenCV is the sole fallback. Mitigation: OpenCV is deterministic and always runs; it's a better fallback than unreliable LLM coordinates.
- [Quality score heuristics are imprecise] → The OCR confidence scorer uses structural heuristics, not ground truth. Mitigation: thresholds are configurable; false positives (unnecessary warnings) are preferable to false negatives (missed bad measurements).

## Migration Plan

1. No database migration needed — `quality_warnings` and `quality_score` are added to the stored JSON blob, not as new columns
2. No breaking API changes — new fields are additive
3. Deploy: rebuild container, restart service
4. Rollback: revert commit, rebuild, restart — stateless service

## Open Questions

- Should the frontend show a dismissible banner for quality warnings, or inline indicators per measurement? (Frontend concern, not this change)
- Should we persist the `QualityReport` as a separate `result_type` in `analysis_results` table for auditability? (Can be added later without schema changes since it's JSON)
