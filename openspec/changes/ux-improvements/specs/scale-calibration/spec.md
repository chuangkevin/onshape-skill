## MODIFIED Requirements

### Requirement: Per-photo calibration
Scale calibration SHALL default to the Project-level shared scale. Each individual photo (View) MAY override the shared scale with its own calibration. When a per-view override exists, it SHALL take precedence over the Project-level scale for that View only.

#### Scenario: New view inherits project scale
- **WHEN** a new photo is added to a Project that has a Project-level scale calibration
- **THEN** the View SHALL automatically use the Project-level scale without requiring individual calibration

#### Scenario: Per-view override
- **WHEN** the user performs a scale calibration on a specific View
- **THEN** that calibration SHALL be stored as a per-view override and SHALL take precedence over the Project-level scale for that View

#### Scenario: Removing per-view override
- **WHEN** the user removes a per-view scale override
- **THEN** the View SHALL revert to using the Project-level shared scale

#### Scenario: No project scale exists
- **WHEN** a View is accessed and no Project-level scale has been set and no per-view override exists
- **THEN** the system SHALL prompt the user to perform a calibration

---

## ADDED Requirements

### Requirement: 套用比例尺 (Apply scale to project)
After completing a scale calibration on any View, the system SHALL ask the user whether to apply the calibration to all other photos in the same Project. This prompt SHALL appear immediately after a successful calibration.

#### Scenario: Apply to all after calibration
- **WHEN** the user finishes calibrating a View and confirms "Apply to all photos in this project"
- **THEN** the system SHALL set the Project-level scale to the new calibration and remove any per-view overrides on other Views (so they inherit the new Project scale)

#### Scenario: Keep calibration local
- **WHEN** the user finishes calibrating a View and selects "Keep for this photo only"
- **THEN** the calibration SHALL be stored as a per-view override and the Project-level scale SHALL remain unchanged

#### Scenario: First calibration in project
- **WHEN** the user calibrates the first View in a Project that has no existing scale
- **THEN** the system SHALL recommend applying it as the Project-level scale with a prompt: "This is the first calibration in this project. Apply as the default scale for all photos?"
