## ADDED Requirements

### Requirement: Confirm scale step
Wizard step 2 SHALL show AI-detected scale and let user confirm or edit. Display format: "Detected ruler {label_a}~{label_b}, suggested {px_per_mm} px/mm".

#### Scenario: User confirms AI scale
- WHEN AI ruler detection succeeded
- AND user clicks confirm button
- THEN system applies the AI-detected px_per_mm value
- AND wizard advances to step 3

#### Scenario: User overrides AI scale
- WHEN AI ruler detection succeeded
- AND user clicks manual override button
- THEN system switches to manual two-point scale calibration tool
- AND user can set scale manually

#### Scenario: No ruler detected
- WHEN AI ruler detection returns {found: false}
- THEN system displays "No ruler detected"
- AND automatically switches to manual scale calibration mode

### Requirement: Confirm contour step
Wizard step 3 SHALL show AI-detected contour overlay (green lines) on the photo and let user accept, fine-tune, or redraw.

#### Scenario: User accepts AI contour
- WHEN AI contour detection succeeded
- AND user clicks confirm button
- THEN system accepts the AI-detected contour
- AND wizard advances to step 4

#### Scenario: User fine-tunes contour
- WHEN AI contour detection succeeded
- AND user clicks fine-tune button
- THEN system switches to polygon tool with AI contour pre-loaded
- AND user can edit individual points

#### Scenario: User redraws contour
- WHEN user clicks redraw button
- THEN system clears AI-detected contour
- AND user draws contour from scratch using polygon tool

#### Scenario: No contour detected
- WHEN AI contour detection returns no contour
- THEN system displays "No contour detected"
- AND automatically switches to manual drawing mode

### Requirement: Auto-advance on confirm
Clicking confirm on any wizard step SHALL advance to the next step without additional user action.

#### Scenario: Confirm advances wizard
- WHEN user clicks confirm on step N
- THEN wizard immediately transitions to step N+1
- AND the next step's UI loads with any available AI results
