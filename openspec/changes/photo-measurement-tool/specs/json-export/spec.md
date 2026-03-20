## ADDED Requirements

### Requirement: Export measurement.json
The system SHALL export all fused measurement data as a structured JSON file (measurement.json) that the onshape-skill can directly consume.

#### Scenario: Export complete measurement
- **WHEN** user clicks "Export JSON" after analysis and fusion
- **THEN** a measurement.json file is downloaded containing part_name, scale, views with contours, features, and caliper_readings

### Requirement: JSON schema compliance
The exported JSON SHALL follow this structure:
```json
{
  "part_name": "string",
  "model_number": "string | null",
  "official_specs": { "key": "value_mm" },
  "views": [{
    "image": "filename",
    "angle": "top|side|front|back|close-up",
    "scale_px_per_mm": "number",
    "contour_mm": [[x, y], ...],
    "features": [{ "type": "string", "center": [x, y], "radius": "number" }],
    "source": "string"
  }],
  "caliper_readings": [{ "location": "string", "value_mm": "number", "source": "string" }],
  "confidence": { "overall": "high|medium|low" }
}
```

#### Scenario: Valid JSON structure
- **WHEN** measurement.json is exported
- **THEN** the file is valid JSON and contains all required top-level fields

### Requirement: Copy to clipboard
The system SHALL provide a "Copy JSON" button that copies the measurement.json content to the clipboard.

#### Scenario: Copy to clipboard
- **WHEN** user clicks "Copy JSON"
- **THEN** the JSON content is copied to the system clipboard and a success toast is shown

### Requirement: Save to file system via API
The system SHALL provide an API endpoint to save measurement.json to a specified directory path on the server.

#### Scenario: Save to project directory
- **WHEN** a POST request is made to /api/export with path="D:/Projects/trackpoint-laptop/doc/L390"
- **THEN** measurement.json is written to that directory
