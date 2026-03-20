## ADDED Requirements

### Requirement: Upload photos via web UI
The system SHALL accept image uploads (JPEG, PNG, WebP) via drag-and-drop or file picker. Each photo SHALL be stored server-side and associated with a measurement project.

#### Scenario: Upload single photo
- **WHEN** user drags an image file onto the upload area
- **THEN** the photo is uploaded, stored on the server, and displayed in the workspace

#### Scenario: Upload multiple photos
- **WHEN** user selects multiple image files via file picker
- **THEN** all photos are uploaded and appear as thumbnails in the project's photo list

#### Scenario: Reject invalid file type
- **WHEN** user attempts to upload a non-image file (e.g., .pdf, .doc)
- **THEN** the system SHALL display an error and reject the upload

### Requirement: Tag photo view angle
The system SHALL allow users to tag each photo with a view angle: top, side, front, back, or close-up.

#### Scenario: Set view angle
- **WHEN** user selects a photo and chooses "top" from the view angle selector
- **THEN** the photo's metadata is updated with angle "top"

### Requirement: Multi-view project management
The system SHALL support multiple photos per measurement project. Users SHALL be able to switch between photos while preserving per-photo drawings and calibrations.

#### Scenario: Switch between photos
- **WHEN** user clicks a different photo thumbnail in the project
- **THEN** the workspace loads that photo with its associated overlay drawings and scale calibration

### Requirement: Photo resize for AI
The system SHALL resize photos to max 2048px longest edge before sending to Gemini API, while keeping the original resolution for OpenCV processing.

#### Scenario: Large photo handling
- **WHEN** a 4000x3000px photo is sent to the AI pipeline
- **THEN** a 2048x1536px version is sent to Gemini, and the original 4000x3000px is used for OpenCV
