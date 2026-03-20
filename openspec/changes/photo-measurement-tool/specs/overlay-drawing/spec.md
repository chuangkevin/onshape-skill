## ADDED Requirements

### Requirement: Transparent drawing layer over photo
The system SHALL render a transparent Canvas layer on top of the uploaded photo. All user drawing operations SHALL occur on this overlay layer without modifying the photo.

#### Scenario: Drawing does not alter photo
- **WHEN** user draws a polyline on the overlay
- **THEN** the drawing appears on top of the photo, and the original photo data is unchanged

### Requirement: Polyline drawing tool
The system SHALL provide a polyline tool. Users click to place vertices; each click adds a line segment from the previous point. Double-click or pressing Enter closes the polyline.

#### Scenario: Draw a closed polyline
- **WHEN** user clicks 5 points and double-clicks the last point
- **THEN** a closed polygon with 5 vertices is created on the overlay

### Requirement: Arc drawing tool
The system SHALL provide a 3-point arc tool. User clicks start point, mid-point, and end point to define a circular arc.

#### Scenario: Draw an arc
- **WHEN** user clicks 3 points using the arc tool
- **THEN** a circular arc passing through all 3 points is rendered on the overlay

### Requirement: Pan and zoom
The system SHALL support pan (middle-click drag or space+drag) and zoom (scroll wheel) on the photo+overlay workspace. Both layers SHALL transform together.

#### Scenario: Zoom into detail
- **WHEN** user scrolls the mouse wheel up over the workspace
- **THEN** both photo and overlay zoom in together, centered on cursor position

### Requirement: Undo/redo
The system SHALL support undo (Ctrl+Z) and redo (Ctrl+Y) for all drawing operations.

#### Scenario: Undo last drawing
- **WHEN** user presses Ctrl+Z after drawing a polyline
- **THEN** the last polyline is removed from the overlay

### Requirement: Export overlay as image
The system SHALL export the overlay drawing as a separate PNG (transparent background) and as a composite image (photo + overlay merged) for AI analysis.

#### Scenario: Export for AI
- **WHEN** the AI pipeline requests the overlay data
- **THEN** the system provides both the standalone overlay PNG and the composite photo+overlay image
