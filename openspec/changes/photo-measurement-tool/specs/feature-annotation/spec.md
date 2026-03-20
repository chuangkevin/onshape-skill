## ADDED Requirements

### Requirement: Hole marking tool
The system SHALL provide a tool to mark circular holes. User clicks center and drags to set radius (or enters radius manually). Each hole stores center coordinates and radius in mm.

#### Scenario: Mark a screw hole
- **WHEN** user selects the hole tool, clicks a center point, and enters radius "1.25 mm"
- **THEN** a circle is drawn at that position with radius 1.25mm, labeled as a hole feature

### Requirement: Feature type labels
The system SHALL allow users to assign a type label to each annotation: hole, tab, slot, connector, mounting-point, or custom text.

#### Scenario: Label a connector
- **WHEN** user draws a rectangle annotation and selects type "connector"
- **THEN** the annotation is stored with type="connector" and displayed with a connector icon

### Requirement: Manual dimension input
The system SHALL allow users to manually input dimensions (from caliper readings, datasheets, etc.) and associate them with a location description.

#### Scenario: Enter caliper reading
- **WHEN** user clicks "Add dimension" and enters location="main body thickness", value="6.7 mm"
- **THEN** the dimension is stored and displayed in the measurements panel

### Requirement: Feature list panel
The system SHALL display a panel listing all annotated features and manual dimensions for the current photo, with the ability to select, edit, or delete each one.

#### Scenario: Delete a feature
- **WHEN** user selects a hole annotation in the feature list and clicks delete
- **THEN** the annotation is removed from both the overlay and the feature list
