## ADDED Requirements

### Requirement: Responsive layout at mobile widths
The system SHALL display correctly at viewport widths of 375px and 390px without horizontal scrolling. The three-column desktop layout SHALL collapse into a single-panel view on screens ≤ 768px wide.

#### Scenario: No horizontal scroll at 375px
- **WHEN** the viewport is 375px wide
- **THEN** all content fits within the viewport with no horizontal overflow

#### Scenario: No horizontal scroll at 390px
- **WHEN** the viewport is 390px wide
- **THEN** all content fits within the viewport with no horizontal overflow

### Requirement: Bottom navigation on mobile
On screens ≤ 768px wide, the system SHALL display a bottom navigation bar with three tabs: Photos, Canvas, and Properties. The active panel SHALL be the only visible panel.

#### Scenario: Default tab on mobile
- **WHEN** the page loads on a mobile viewport
- **THEN** the Canvas tab is active and the canvas panel is visible

#### Scenario: Switch to Photos tab
- **WHEN** the user taps the Photos tab in the bottom nav
- **THEN** the photo list sidebar becomes visible and canvas/properties panels are hidden

#### Scenario: Switch to Properties tab
- **WHEN** the user taps the Properties tab in the bottom nav
- **THEN** the properties/right panel becomes visible and canvas/photo panels are hidden

### Requirement: Touch-friendly tap targets
All interactive buttons SHALL have a minimum tap target size of 44×44px on mobile viewports.

#### Scenario: Toolbar buttons are tap-friendly
- **WHEN** the viewport is ≤ 768px wide
- **THEN** all toolbar buttons have at least 44px height and 44px width

### Requirement: Touch drawing on canvas
The canvas drawing tools SHALL respond to touch input (finger drawing) on mobile devices.

#### Scenario: Drawing with finger
- **WHEN** the user touches and drags on the canvas on a mobile device
- **THEN** the active drawing tool responds as if the user were using a mouse

### Requirement: Modals scrollable and usable on mobile
All modal overlays (Wizard, Settings, Code, CAD Preview) SHALL be scrollable and fully accessible at 375px wide.

#### Scenario: Wizard overlay on mobile
- **WHEN** the wizard overlay is open on a 375px viewport
- **THEN** all wizard step content is accessible by scrolling within the overlay

#### Scenario: CAD Preview modal on mobile
- **WHEN** the CAD preview modal is opened on a mobile viewport
- **THEN** the Three.js canvas fills at least 90% of the viewport width and the 3D model is visible

### Requirement: Dynamic viewport height support
The layout SHALL use dynamic viewport height (`dvh`) to avoid browser chrome overlap on mobile browsers.

#### Scenario: Bottom nav not covered by browser chrome
- **WHEN** viewed on a mobile browser with visible browser chrome
- **THEN** the bottom navigation bar is not obscured by the browser address bar or navigation controls
