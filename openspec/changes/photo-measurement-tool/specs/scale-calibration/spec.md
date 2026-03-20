## ADDED Requirements

### Requirement: Two-point scale calibration
The system SHALL provide a scale calibration tool. User clicks two points on a ruler/caliper in the photo and enters the real-world distance between them. The system SHALL calculate and store the px/mm ratio.

#### Scenario: Calibrate from ruler
- **WHEN** user clicks point A at pixel (100, 200), clicks point B at pixel (442, 200), and enters "100 mm"
- **THEN** the system calculates px_per_mm = 3.42 and stores it for this photo

### Requirement: Visual scale indicator
The system SHALL display the current scale ratio and a visual scale bar on the workspace after calibration.

#### Scenario: Scale bar display
- **WHEN** scale calibration is completed with px_per_mm = 3.42
- **THEN** a scale bar labeled "10 mm" appears in the corner of the workspace

### Requirement: Pixel-to-mm coordinate conversion
After calibration, all drawing coordinates SHALL be convertible to mm. The system SHALL provide both px and mm coordinates for any drawn shape.

#### Scenario: Get mm coordinates
- **WHEN** user draws a polyline on a calibrated photo
- **THEN** the polyline's vertex coordinates are available in both px and mm units

### Requirement: Per-photo calibration
Each photo SHALL have its own independent scale calibration, since photos may be taken at different distances/zoom levels.

#### Scenario: Different scales per photo
- **WHEN** photo A has px_per_mm=3.42 and photo B has px_per_mm=5.1
- **THEN** switching between photos uses the correct scale for each
