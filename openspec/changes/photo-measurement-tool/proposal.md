## Why

The current onshape-skill relies entirely on Claude Vision to extract dimensions and shapes from reference photos. Vision models (Claude, Gemini, GPT-4V) cannot count pixels or trace precise contours — they approximate. This results in incorrect edge details (L390 keyboard) and wrong shapes (L390 battery modeled as overlapping rectangles instead of its true irregular profile). A dedicated measurement tool is needed to bridge the gap between photos and accurate FeatureScript generation.

## What Changes

- **New standalone web application** at `tools/measure/` for photo-based part measurement
- **Photo overlay drawing system**: users upload photos and draw contours directly on them using a transparent Canvas layer, providing shape intent that AI can interpret alongside the photo
- **Scale calibration tool**: click two points on a ruler/caliper in the photo + input real distance to establish px/mm conversion
- **Feature annotation tools**: mark holes, tabs, connectors, and other mechanical features with semantic labels
- **Gemini API key pool** (`geminiKeys.ts`): round-robin rotation across 5 API keys with 429 failover and usage tracking in SQLite
- **Parallel AI analysis pipeline**: concurrent Gemini 2.5 Flash calls for OCR (caliper readings), label reading + WebSearch (official specs), and overlay+photo interpretation
- **Python + OpenCV edge detection**: subprocess-based contour extraction near user-marked regions for pixel-precise geometry
- **Fusion engine**: merges all data sources (official specs > OpenCV contours > user drawings > Vision estimates) into a unified `measurement.json`
- **Structured JSON export**: output format consumable by Claude's onshape-skill for direct FeatureScript code generation

## Capabilities

### New Capabilities
- `photo-upload`: Photo upload, multi-view management, and view angle tagging (top/side/front/close-up)
- `overlay-drawing`: Canvas overlay drawing tools (polyline, arc, polygon) on top of uploaded photos
- `scale-calibration`: Two-point scale reference with px/mm conversion
- `feature-annotation`: Semantic feature marking (holes, tabs, slots, connectors) with dimensions
- `gemini-key-pool`: Multi-key API pool with round-robin, failover, and SQLite-backed usage tracking
- `ai-analysis-pipeline`: Parallel Gemini calls for OCR, label+search, and overlay interpretation
- `opencv-edge-detection`: Python+OpenCV subprocess for precise contour extraction near user-marked regions
- `measurement-fusion`: Multi-source data fusion engine with priority-based merging
- `json-export`: Structured measurement.json output for FeatureScript generation

### Modified Capabilities
<!-- No existing capabilities to modify -->

## Impact

- **New directory**: `tools/measure/` with full web app (frontend + backend)
- **New dependencies**: Node.js (express, better-sqlite3, vite), Python (opencv-python, numpy)
- **External APIs**: Google Gemini 2.5 Flash (5 API keys)
- **Integration point**: Output `measurement.json` consumed by existing onshape-skill's SKILL.md workflow
- **No changes to existing SKILL.md or reference.md** — the measurement tool is a standalone pre-processing step
