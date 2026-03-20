## MODIFIED Requirements

### Requirement: Multi-view project management
A Project SHALL represent a single part (零件). Uploaded photos SHALL be treated as Views of that part, each representing a different viewing angle. A scale calibration SHALL be shareable across all Views within the same Project, allowing the user to calibrate once and apply to many.

#### Scenario: Creating a project with multiple photos
- **WHEN** the user creates a new project and uploads multiple photos
- **THEN** each photo SHALL be stored as a View under that Project, and the Project SHALL represent the single part being modeled

#### Scenario: Shared scale across views
- **WHEN** a scale calibration exists on the Project level
- **THEN** all Views within that Project SHALL use the shared scale unless individually overridden

#### Scenario: Adding a view to existing project
- **WHEN** the user adds a new photo to an existing Project
- **THEN** it SHALL be added as a new View and automatically inherit the Project-level scale calibration if one exists

---

## ADDED Requirements

### Requirement: 共用比例尺 (Shared scale application)
After calibrating a scale on any single photo, the system SHALL provide an "Apply to all photos" (套用到所有照片) option that applies the same calibration to all other Views in the same Project.

#### Scenario: Apply calibration to all views
- **WHEN** the user completes a scale calibration on one photo and selects "Apply to all photos"
- **THEN** the system SHALL set the Project-level scale to that calibration and apply it to all Views that do not have an individual override

#### Scenario: Decline shared calibration
- **WHEN** the user completes a scale calibration and declines the "Apply to all photos" option
- **THEN** the calibration SHALL only apply to the current View and SHALL NOT affect other Views or the Project-level scale

#### Scenario: Override warning
- **WHEN** some Views already have individual scale overrides and the user selects "Apply to all photos"
- **THEN** the system SHALL warn the user that existing per-view overrides will be replaced, and require confirmation before proceeding

---

### Requirement: Views 圖示 (View angle icons)
The photo list SHALL display an angle icon for each View indicating its viewing angle. Supported angle types SHALL include: 俯視 (top), 側視 (side), 正面 (front), 背面 (back), and 特寫 (close-up).

#### Scenario: Default icon assignment
- **WHEN** a new photo is uploaded as a View
- **THEN** the system SHALL display a default unclassified icon until the user assigns an angle type

#### Scenario: Manual angle assignment
- **WHEN** the user selects a View and assigns an angle type (top/side/front/back/close-up)
- **THEN** the photo list SHALL update to display the corresponding angle icon for that View

#### Scenario: Icon visibility in list
- **WHEN** the user views the photo list of a Project
- **THEN** each View entry SHALL display its assigned angle icon alongside the photo thumbnail
