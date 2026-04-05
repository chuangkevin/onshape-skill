## ADDED Requirements

### Requirement: FastSAM confidence threshold filtering
The system SHALL filter FastSAM contour results by a minimum confidence threshold before accepting them. Contours whose `confidence` value is below the threshold SHALL be discarded. The threshold SHALL be configurable via the `FASTSAM_MIN_CONFIDENCE` environment variable and SHALL default to `0.7` when not set.

#### Scenario: High-confidence contour accepted
- **WHEN** FastSAM returns a contour with `confidence >= FASTSAM_MIN_CONFIDENCE`
- **THEN** the contour is included in the result with `found: true`

#### Scenario: Low-confidence contour rejected
- **WHEN** FastSAM returns a contour with `confidence < FASTSAM_MIN_CONFIDENCE`
- **THEN** the contour is discarded

#### Scenario: All contours below threshold
- **WHEN** FastSAM returns only contours with `confidence < FASTSAM_MIN_CONFIDENCE`
- **THEN** `detectContourWithFastSAM` returns `{ found: false, contours: [], method: 'fastsam' }`

#### Scenario: FastSAM contour with no confidence field
- **WHEN** FastSAM returns a contour without a `confidence` field
- **THEN** the contour is treated as if confidence is `0` and is discarded (fail-safe)

### Requirement: Remove Gemini contour detection
The system SHALL NOT use Gemini Vision API for contour detection. The `detectContourWithGemini` function, `GeminiContourResult` type, and `buildContourPrompt` helper SHALL be removed from the codebase. Gemini SHALL remain available for OCR and semantic analysis tasks only.

#### Scenario: Pipeline fallback when FastSAM fails
- **WHEN** FastSAM is unavailable or returns `found: false`
- **THEN** the pipeline falls back to OpenCV-only contour detection (NOT Gemini)

#### Scenario: No Gemini contour in codebase
- **WHEN** a developer searches for `detectContourWithGemini`
- **THEN** no definition is found anywhere in the codebase
