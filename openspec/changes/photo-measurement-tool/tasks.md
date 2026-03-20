## 1. Project Setup & Dependencies

- [x] 1.1 Create `tools/measure/` directory with package.json (express, better-sqlite3, vite, typescript, vitest, playwright)
- [x] 1.2 Create tsconfig.json, vite.config.ts, and project structure (src/server, src/client, src/shared, tests/)
- [x] 1.3 Install Python + opencv-python + numpy, create requirements.txt
- [x] 1.4 Create shared types (src/shared/types.ts) for measurement data structures
- [x] 1.5 Test: project builds and dev server starts successfully

## 2. SQLite Database

- [x] 2.1 Create db.ts with SQLite setup + migration system (better-sqlite3)
- [x] 2.2 Create schema: settings, api_key_usage, projects, photos, drawings, features, analysis_results tables
- [x] 2.3 Seed initial data: 5 Gemini API keys into settings table
- [x] 2.4 Test: unit tests for db initialization and migrations

## 3. Gemini Key Pool

- [x] 3.1 Implement geminiKeys.ts: multi-source key loading (ENV + DB), deduplication
- [x] 3.2 Implement round-robin rotation (getGeminiApiKey)
- [x] 3.3 Implement 429 failover (getGeminiApiKeyExcluding)
- [x] 3.4 Implement usage tracking (trackUsage → api_key_usage table)
- [x] 3.5 Implement key CRUD (addApiKey, removeApiKey, getKeyList with stats)
- [x] 3.6 Implement 60s cache with invalidateKeyCache()
- [x] 3.7 Test: unit tests for rotation, failover, caching, usage tracking

## 4. Express Server & API Routes

- [x] 4.1 Create server entry (src/server/index.ts) with Express + static file serving
- [x] 4.2 Create projects routes: POST/GET/DELETE /api/projects
- [x] 4.3 Create photos routes: POST /api/projects/:id/photos (multer upload), GET, DELETE
- [x] 4.4 Create keys routes: GET/POST/DELETE /api/keys, GET /api/keys/stats
- [x] 4.5 Create analyze route: POST /api/projects/:id/analyze (triggers AI pipeline)
- [x] 4.6 Create export route: POST /api/projects/:id/export (save measurement.json)
- [x] 4.7 Test: API route tests with supertest

## 5. Frontend - Photo Upload & Workspace

- [x] 5.1 Create index.html with basic layout (toolbar, canvas workspace, side panels)
- [x] 5.2 Implement photo upload (drag-and-drop + file picker) with thumbnail gallery
- [x] 5.3 Implement PhotoLayer.ts: render photo on Canvas with pan (space+drag) and zoom (scroll wheel)
- [x] 5.4 Implement view angle tagging UI (top/side/front/back/close-up selector)
- [ ] 5.5 Test: E2E test for photo upload and display

## 6. Frontend - Drawing Overlay

- [x] 6.1 Implement DrawingLayer.ts: transparent Canvas overlay with pointer event handling
- [x] 6.2 Implement PolylineTool.ts: click-to-place vertices, double-click to close
- [x] 6.3 Implement ArcTool.ts: 3-point arc drawing
- [x] 6.4 Implement SelectTool.ts: select, move, delete drawn shapes
- [x] 6.5 Implement undo/redo system (Ctrl+Z / Ctrl+Y)
- [x] 6.6 Implement overlay export (standalone PNG + composite photo+overlay)
- [ ] 6.7 Test: E2E test for drawing tools and undo/redo

## 7. Frontend - Scale Calibration

- [x] 7.1 Implement ScaleTool.ts: two-point click + distance input dialog
- [x] 7.2 Implement px/mm conversion and display scale bar
- [x] 7.3 Wire scale to all drawing coordinates (show mm values on hover)
- [x] 7.4 Implement per-photo calibration storage
- [ ] 7.5 Test: E2E test for scale calibration and coordinate conversion

## 8. Frontend - Feature Annotation

- [x] 8.1 Implement HoleTool.ts: click center + radius input for circle marking
- [x] 8.2 Implement feature type selector (hole, tab, slot, connector, mounting-point, custom)
- [x] 8.3 Implement manual dimension input panel (location + value_mm)
- [x] 8.4 Implement feature list panel with select/edit/delete
- [ ] 8.5 Test: E2E test for feature annotation workflow

## 9. Python OpenCV Edge Detection

- [ ] 9.1 Create edge_detect.py: accept image path + ROI JSON, run Canny edge detection
- [ ] 9.2 Implement contour extraction with findContours + approxPolyDP
- [ ] 9.3 Implement circle detection with HoughCircles
- [ ] 9.4 Create opencv.ts wrapper: spawn Python subprocess, parse JSON output
- [ ] 9.5 Implement ROI derivation from user drawing bounding box (+10% padding)
- [ ] 9.6 Implement Python availability check on server startup
- [ ] 9.7 Test: unit tests with sample images, fallback when Python unavailable

## 10. Gemini AI Analysis Pipeline

- [ ] 10.1 Create geminiClient.ts: Gemini 2.5 Flash API wrapper with key pool integration
- [ ] 10.2 Implement OCR service (ocr.ts): send caliper close-ups, extract numeric readings
- [ ] 10.3 Implement search service (search.ts): read labels, WebSearch for official specs
- [ ] 10.4 Implement overlay service (overlay.ts): send composite image, interpret user drawing
- [ ] 10.5 Implement parallel pipeline orchestrator (analyze.ts): fire all services concurrently with different keys
- [ ] 10.6 Implement retry with 429 failover
- [ ] 10.7 Implement result storage in SQLite
- [ ] 10.8 Test: integration tests with mocked Gemini responses + one live E2E test

## 11. Measurement Fusion Engine

- [ ] 11.1 Implement fusion.ts: merge data from official specs, OpenCV, user drawing, and Gemini Vision
- [ ] 11.2 Implement priority-based resolution (official > opencv > user > vision)
- [ ] 11.3 Implement source tracking for every measurement
- [ ] 11.4 Implement confidence level assignment (high/medium/low)
- [ ] 11.5 Implement conflict detection and reporting (>5% tolerance)
- [ ] 11.6 Test: unit tests with multi-source mock data, conflict scenarios

## 12. JSON Export

- [ ] 12.1 Implement measurement.json generation from fused data
- [ ] 12.2 Implement frontend "Export JSON" button (download file)
- [ ] 12.3 Implement "Copy JSON" button (clipboard)
- [ ] 12.4 Implement server-side save to specified directory path
- [ ] 12.5 Test: E2E test for export workflow, validate JSON schema

## 13. E2E Integration Test

- [ ] 13.1 Full workflow E2E test: upload photo → calibrate → draw → annotate → analyze → export
- [ ] 13.2 Test with actual L390 battery photos as fixture data
- [ ] 13.3 Verify exported measurement.json is consumable by onshape-skill format
