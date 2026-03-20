## ADDED Requirements

### Requirement: Auto-analyze on upload
Photo upload SHALL trigger background analysis via `POST /api/projects/:id/photos/:photoId/auto-analyze`. Analysis SHALL start immediately without user intervention.

#### Scenario: Upload triggers analysis
- WHEN a photo is successfully uploaded
- THEN system automatically calls auto-analyze endpoint
- AND analysis begins within 1 second of upload completion

#### Scenario: Analysis results stored
- WHEN all analysis sub-tasks complete
- THEN results SHALL be stored in DB (analysis_results table)
- AND results are retrievable for subsequent page loads

### Requirement: SSE progress
Analysis SHALL send Server-Sent Events for each sub-task, reporting status transitions (running, done, error) and results.

#### Scenario: SSE events for each step
- WHEN auto-analyze is triggered
- THEN SSE stream emits {step, status: "running"} when each sub-task starts
- AND SSE stream emits {step, status: "done", result} when each sub-task completes
- AND SSE stream emits {step: "complete", result} when all sub-tasks finish

#### Scenario: SSE error handling
- WHEN a sub-task fails
- THEN SSE stream emits {step, status: "error", error} for the failed task
- AND remaining sub-tasks continue executing

### Requirement: Parallel execution
Ruler detection, contour extraction, and label OCR SHALL run in parallel to minimize total analysis time.

#### Scenario: Parallel sub-tasks
- WHEN auto-analyze is triggered
- THEN ruler detection (Gemini), contour extraction (OpenCV), and label OCR (Gemini) start concurrently
- AND total analysis time is bounded by the slowest sub-task, not the sum

#### Scenario: Independent failure
- WHEN one sub-task fails (e.g., ruler detection)
- THEN other sub-tasks (contour, labels) SHALL still complete successfully
