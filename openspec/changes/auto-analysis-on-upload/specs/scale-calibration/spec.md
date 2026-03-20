## ADDED Requirements

### Requirement: AI auto-calibration
System SHALL attempt AI ruler auto-detection before asking for manual input. If AI detection succeeds, user only needs to confirm the result.

#### Scenario: AI calibration succeeds
- WHEN photo is uploaded and auto-analysis completes
- AND ruler detection returns {found: true, px_per_mm}
- THEN system presents AI-detected scale for user confirmation
- AND manual calibration is not required unless user chooses to override

#### Scenario: AI calibration fails
- WHEN ruler detection returns {found: false}
- THEN system falls back to manual two-point calibration
- AND user is informed that no ruler was detected

## MODIFIED Requirements

### Requirement: Two-point scale calibration
MODIFIED: Two-point manual calibration now serves as fallback when AI detection fails, rather than the primary calibration method.

#### Scenario: Manual fallback
- WHEN AI ruler detection fails or user chooses to override
- THEN system activates two-point scale calibration tool
- AND user clicks two points on a known distance
- AND enters the real-world distance between them

#### Scenario: Override AI with manual
- WHEN user has AI-detected scale but wants to recalibrate
- THEN user clicks manual override button
- AND two-point calibration tool activates
- AND new manual calibration replaces AI-detected value
