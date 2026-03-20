## ADDED Requirements

### Requirement: Priority-based data fusion
The system SHALL merge measurement data from multiple sources using this priority order:
1. Official specs from WebSearch (highest)
2. OpenCV contour extraction
3. User overlay drawing + scale calibration
4. Gemini Vision estimation (lowest)

#### Scenario: Official spec overrides OpenCV
- **WHEN** WebSearch finds official length=291mm and OpenCV measures length=289mm
- **THEN** the fused result uses 291mm with source="official_spec"

#### Scenario: OpenCV overrides Vision estimate
- **WHEN** OpenCV extracts a contour and Gemini estimates a different shape
- **THEN** the fused contour uses OpenCV coordinates with source="opencv"

### Requirement: Source tracking
Every measurement in the fused output SHALL include a source field indicating where the data came from: "official_spec", "opencv", "user_drawing", or "gemini_vision".

#### Scenario: Mixed sources
- **WHEN** fusion produces a result with official length, OpenCV contour, and user-marked holes
- **THEN** each measurement has its source: length.source="official_spec", contour.source="opencv", holes[0].source="user_drawing"

### Requirement: Confidence levels
The system SHALL assign confidence levels to measurements: high (official spec or multi-source validated), medium (single calibrated source), low (estimated).

#### Scenario: Confidence assignment
- **WHEN** a dimension appears in both official specs and OpenCV measurement (within 5% tolerance)
- **THEN** that dimension gets confidence="high"

### Requirement: Conflict reporting
When sources disagree beyond 5% tolerance, the system SHALL flag the conflict and present both values to the user for resolution.

#### Scenario: Dimension conflict
- **WHEN** official spec says width=81.5mm but OpenCV measures width=75mm (>5% difference)
- **THEN** the system flags this as a conflict and presents both values in the UI for user decision
