## ADDED Requirements

### Requirement: Adaptive Canny thresholds via Otsu
The edge detection script SHALL compute Canny edge detection thresholds adaptively using the Otsu binarization threshold of the preprocessed (CLAHE + blur) grayscale image. The thresholds SHALL be: `low = 0.5 * otsu_value`, `high = otsu_value`. The hardcoded values of `30` and `100` SHALL be removed.

#### Scenario: Low-contrast image
- **WHEN** the input image has low overall contrast (Otsu threshold < 60)
- **THEN** Canny thresholds are computed as `low = 0.5 * otsu`, `high = otsu` rather than using 30/100

#### Scenario: High-contrast image
- **WHEN** the input image has high overall contrast (Otsu threshold > 150)
- **THEN** Canny thresholds are computed as `low = 0.5 * otsu`, `high = otsu` rather than using 30/100

#### Scenario: Thresholds always positive
- **WHEN** Otsu threshold computes to 0 (uniform image)
- **THEN** the system falls back to a minimum `low = 30`, `high = 60` to avoid degenerate Canny behavior

### Requirement: Configurable minimum contour area
The edge detection script SHALL filter out contours smaller than a configurable minimum area ratio. The default minimum area ratio SHALL be `0.005` (0.5% of the processed image area). The ratio SHALL be configurable via the `--min-contour-area` command-line argument (a float between 0 and 1). The previous hardcoded default of `0.0001` (0.01%) SHALL be replaced.

#### Scenario: Default area filtering removes noise
- **WHEN** `--min-contour-area` is not specified
- **THEN** contours smaller than 0.5% of image area are excluded from results

#### Scenario: Custom area threshold
- **WHEN** `--min-contour-area 0.01` is passed
- **THEN** contours smaller than 1% of image area are excluded from results

#### Scenario: Large contour always passes
- **WHEN** a contour covers more than 5% of the image area
- **THEN** it is always included regardless of the minimum area threshold

### Requirement: Configurable max-size default
The `--max-size` parameter SHALL default to `2048` pixels (longest edge) when not specified, replacing the previous implicit no-limit behavior. Callers may override this with `--max-size N`.

#### Scenario: Large image processed at 2048px
- **WHEN** a 4000×3000 image is processed without `--max-size`
- **THEN** it is resized to fit within 2048px longest edge before processing, and output coordinates are scaled back to original image space

#### Scenario: Small image not resized
- **WHEN** an 800×600 image is processed without `--max-size`
- **THEN** it is processed at original resolution (no downscaling applied)
