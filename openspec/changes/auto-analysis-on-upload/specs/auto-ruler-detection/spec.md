## ADDED Requirements

### Requirement: Gemini ruler detection
System SHALL send photo to Gemini with a prompt requesting ruler/scale detection. Response SHALL include pixel coordinates of two scale markings and the real-world distance between them.

#### Scenario: Ruler found in photo
- WHEN photo contains a visible ruler with clear markings
- THEN system returns {found: true, point_a, point_b, distance_mm, px_per_mm}

#### Scenario: No ruler found
- WHEN photo has no visible ruler
- THEN system returns {found: false} and user must calibrate manually

### Requirement: Pixel coordinate accuracy
Gemini SHALL return approximate pixel coordinates (within 5% of image dimensions) for ruler markings.

#### Scenario: Coordinate validation
- WHEN Gemini returns coordinates
- THEN coordinates SHALL be within image bounds and distance SHALL be > 0
