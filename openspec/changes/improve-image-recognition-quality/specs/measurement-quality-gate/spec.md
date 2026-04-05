## ADDED Requirements

### Requirement: QualityGate evaluates pipeline output
The system SHALL provide a `QualityGate` module (`qualityGate.ts`) with an `evaluateQuality(result)` pure function that computes a `QualityReport` from the full pipeline result. The report SHALL include: `overall_confidence` (0–1 float), `stage_scores` (per-stage confidence), `warnings` (human-readable string array), and `flagged_for_review` (boolean).

#### Scenario: High-quality result
- **WHEN** OCR extracts ≥2 measurements with units and contour detection succeeds with high confidence
- **THEN** `overall_confidence >= 0.8` and `flagged_for_review = false`

#### Scenario: Low-quality result
- **WHEN** OCR extracts no numeric measurements and contour detection fails
- **THEN** `overall_confidence < 0.5` and `flagged_for_review = true`

#### Scenario: Quality report is pure
- **WHEN** `evaluateQuality` is called with the same input twice
- **THEN** it returns identical results (no side effects)

### Requirement: OCR confidence scoring
The system SHALL score OCR result quality based on: (a) number of numeric measurement values extracted (more = higher confidence), (b) presence of measurement units (mm, cm, inch, etc.), (c) value range sanity (reject readings ≤ 0 or > 10000mm). The score SHALL be a float from 0 to 1. The scoring logic SHALL be configurable — minimum numeric count and value range limits SHALL be readable from environment variables `OCR_MIN_READINGS` (default `1`) and `OCR_MAX_VALUE_MM` (default `10000`).

#### Scenario: OCR with valid measurements and units
- **WHEN** OCR returns 3 measurements with units all within range
- **THEN** `stage_scores.ocr >= 0.8`

#### Scenario: OCR with no numeric values
- **WHEN** OCR returns only text without numeric values
- **THEN** `stage_scores.ocr = 0` and warnings include a human-readable message

#### Scenario: OCR values out of range
- **WHEN** OCR returns a value > 10000mm
- **THEN** the out-of-range value is excluded from confidence scoring and a warning is added

### Requirement: Cross-validation between OCR and contour measurements
The system SHALL compare the largest OCR measurement to the largest contour bounding box dimension when both are available. If they diverge by more than the configured threshold, a warning SHALL be added to the `QualityReport`. The divergence threshold SHALL be configurable via `MEASUREMENT_DIVERGENCE_THRESHOLD` environment variable (float 0–1, default `0.2` = 20%).

#### Scenario: OCR and contour agree
- **WHEN** the largest OCR reading is within 20% of the largest contour bounding box dimension
- **THEN** no cross-validation warning is added

#### Scenario: OCR and contour diverge significantly
- **WHEN** the largest OCR reading differs from the largest contour dimension by more than `MEASUREMENT_DIVERGENCE_THRESHOLD`
- **THEN** a warning is added: "OCR and contour measurements diverge significantly — please verify manually"

#### Scenario: Only one source available
- **WHEN** either OCR readings or contour result is absent
- **THEN** cross-validation is skipped (no warning added for missing data alone)

### Requirement: Quality warnings surfaced in API response
The system SHALL attach the `QualityReport` to the analysis pipeline response. The existing `FullAnalysisResult` type SHALL be extended with a `quality` field of type `QualityReport`. The warnings SHALL be human-readable strings suitable for display to end users. The API response shape SHALL remain backwards-compatible (new field, not a replacement).

#### Scenario: Warnings present in response
- **WHEN** the pipeline runs and quality issues are detected
- **THEN** the API response includes `quality.warnings` as a non-empty string array and `quality.flagged_for_review = true`

#### Scenario: No warnings
- **WHEN** the pipeline runs and all quality checks pass
- **THEN** `quality.warnings` is an empty array and `quality.flagged_for_review = false`
