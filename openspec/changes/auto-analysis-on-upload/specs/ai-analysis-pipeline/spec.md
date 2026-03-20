## ADDED Requirements

### Requirement: Upload-time analysis
Lightweight analysis SHALL be triggered automatically on photo upload. This includes ruler detection, contour extraction, and label OCR running in parallel via SSE.

#### Scenario: Upload triggers pipeline
- WHEN a photo upload completes
- THEN server fires auto-analyze pipeline
- AND pipeline runs ruler detection (Gemini), contour extraction (OpenCV), label OCR (Gemini) concurrently

#### Scenario: Results available for wizard
- WHEN auto-analysis completes before user reaches a wizard step
- THEN that step loads results immediately without waiting
- AND wizard can display results as soon as user navigates to the step

## MODIFIED Requirements

### Requirement: Parallel Gemini analysis
MODIFIED: Add ruler detection as a new parallel task alongside existing label OCR and contour extraction.

#### Scenario: Three parallel tasks
- WHEN auto-analyze pipeline starts
- THEN three tasks run in parallel:
  - [Key A] Gemini ruler detection (pixel coords + real distance)
  - [Key B] Gemini label OCR (model number, specs text)
  - [Key C] OpenCV edge detection + contour extraction
- AND each task reports progress independently via SSE

#### Scenario: Gemini API pool utilization
- WHEN multiple Gemini tasks are queued
- THEN system uses separate API keys for ruler detection and label OCR
- AND tasks do not block each other in the API pool
