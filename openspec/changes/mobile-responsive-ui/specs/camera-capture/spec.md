## ADDED Requirements

### Requirement: Camera capture on mobile file input
The photo file input SHALL include `accept="image/*"` and `capture="environment"` attributes so that mobile browsers offer the rear camera as the primary capture option.

#### Scenario: Mobile browser offers camera option
- **WHEN** the user taps the "Add Photo" button on a mobile device
- **THEN** the browser presents the option to take a photo with the rear (environment-facing) camera

#### Scenario: Desktop browser still shows file picker
- **WHEN** the user clicks the "Add Photo" button on a desktop browser
- **THEN** the browser opens a standard file picker (camera capture attribute is ignored on desktop)

#### Scenario: Multiple image formats accepted
- **WHEN** the user captures or selects an image
- **THEN** the system accepts JPEG, PNG, and WebP formats
