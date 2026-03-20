## MODIFIED Requirements

### Requirement: Wizard steps
MODIFIED: Wizard steps change from manual operation to confirming AI results.

Old flow: Step 1 upload -> Step 2 manual scale -> Step 3 manual contour -> Step 4 features -> Step 5 analyze

New flow: Step 1 upload (auto-analysis starts) -> Step 2 confirm scale (show AI result, edit if wrong) -> Step 3 confirm contour (show AI contour, edit/redraw) -> Step 4 confirm features + export

#### Scenario: New wizard flow
- WHEN user enters wizard mode
- AND uploads a photo
- THEN step 1 completes and auto-analysis begins in background
- AND step 2 presents AI-detected scale for confirmation
- AND step 3 presents AI-detected contour for confirmation
- AND step 4 presents features and export options

#### Scenario: Wizard with failed AI
- WHEN AI analysis fails for a step
- THEN that step falls back to manual operation mode
- AND wizard flow continues normally

### Requirement: Auto tool switching
MODIFIED: Instead of switching to the correct manual tool per step, wizard now auto-loads AI results and presents confirm/edit UI.

#### Scenario: Step loads AI results
- WHEN wizard transitions to a new step
- THEN system checks for available AI results for that step
- AND if results exist, displays them with confirm/edit options
- AND if no results, presents manual tool as fallback

#### Scenario: Right panel in wizard mode
- WHEN wizard mode is active
- THEN right panel removes the "操作流程" guide panel
- AND right panel shows only: photo angle, scale info, features, dimensions, action buttons
