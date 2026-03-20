## Context

The onshape-skill generates FeatureScript CAD code from reference photos. Currently, Claude Vision handles all measurement — but it cannot count pixels or trace precise contours. Real parts like the L390 battery (irregular L-shape with tabs, holes, and a raised control board section) get modeled as overlapping rectangles instead of their true profile.

The user has 5 Gemini API keys and wants a parallel pipeline. They want a web app where they upload photos, draw overlay contours on top of the photo, and let AI + OpenCV refine the geometry. Output is `measurement.json` for the existing onshape-skill.

## Goals / Non-Goals

**Goals:**
- Accurate shape extraction from reference photos (mm-precision contours)
- Web-based UI with Canvas overlay drawing on uploaded photos
- Parallel Gemini API pipeline with key pool (round-robin, 429 failover)
- OpenCV edge detection for pixel-precise contour refinement
- Multi-source fusion (official specs > OpenCV > user drawing > Vision estimate)
- Structured JSON export compatible with onshape-skill
- E2E test coverage

**Non-Goals:**
- 3D reconstruction from photos (this tool produces 2D profiles per view)
- Automatic FeatureScript generation (that remains in onshape-skill)
- Real-time collaboration / multi-user
- Mobile-optimized UI (desktop browser is fine)
- CAM/manufacturing output

## Decisions

### 1. Architecture: Monolithic web app (Express + Vite)

**Choice**: Single Node.js server serving both API and frontend.

**Alternatives considered**:
- Separate frontend/backend repos → unnecessary complexity for a tool
- Static HTML file → can't run Python subprocess or manage API keys server-side
- Electron/Tauri desktop app → user wants web

**Rationale**: Simplest architecture that supports server-side Python subprocess calls and API key management. Vite handles frontend bundling with HMR during development.

### 2. Database: SQLite via better-sqlite3

**Choice**: Embedded SQLite for API key storage, usage tracking, and project/measurement persistence.

**Alternatives considered**:
- PostgreSQL → overkill, requires separate server
- JSON files → no query capability, race conditions
- In-memory only → loses usage tracking across restarts

**Rationale**: Zero-config, single-file database. `better-sqlite3` is synchronous (simpler code) and fast. Matches the user's design spec.

### 3. Frontend drawing: HTML Canvas with two-layer architecture

**Choice**: Two stacked Canvas elements — bottom layer renders the photo, top layer is transparent for user drawing.

```
┌─────────────────────────────────┐
│  Canvas 2 (drawing layer)       │  ← pointer events here
│  - transparent background       │
│  - user strokes, points, shapes │
├─────────────────────────────────┤
│  Canvas 1 (photo layer)         │  ← pointer-events: none
│  - uploaded image rendered      │
│  - pan/zoom transforms          │
└─────────────────────────────────┘
```

**Rationale**: Separating layers means we can export the drawing layer independently (as mask/overlay for AI), composite them for display, and clear drawings without re-rendering the photo.

### 4. AI pipeline: Parallel Gemini calls with key pool

**Choice**: Fire multiple Gemini 2.5 Flash requests concurrently, each using a different API key from the pool.

```
Request router:
  ┌─ OCR task ──────────→ Key A → Gemini (read caliper displays)
  ├─ Label task ─────────→ Key B → Gemini (read text + grounding search)
  ├─ Overlay task ───────→ Key C → Gemini (interpret user drawing + photo)
  └─ Spec search task ──→ Key D → Gemini (search official dimensions)
      │
      │ if 429 → getKeyExcluding(failed) → retry with different key
```

**Rationale**: 5 keys enable true parallelism without hitting per-key rate limits. Round-robin distributes load evenly. 429 failover provides resilience.

### 5. OpenCV integration: Python subprocess

**Choice**: Call Python scripts via `child_process.spawn()` from Node.js.

**Input**: Photo path + ROI (region of interest from user drawing) as JSON args
**Output**: Contour points as JSON on stdout

**Alternatives considered**:
- OpenCV.js (in-browser) → limited API, large WASM bundle (~8MB), poor performance on high-res photos
- sharp/jimp (Node.js image libs) → no edge detection algorithms
- Gemini code execution sandbox → can't access local files

**Rationale**: Full OpenCV API, mature ecosystem, user approved installing Python locally. Subprocess isolates Python from Node.js runtime.

### 6. Fusion priority order

```
Priority 1: Official specs from WebSearch (most authoritative)
Priority 2: OpenCV contour extraction (pixel-precise, deterministic)
Priority 3: User overlay drawing + scale calibration (human-verified intent)
Priority 4: Gemini Vision estimation (least precise, used as fallback)
```

When sources conflict, higher priority wins. All sources are preserved in the output JSON with confidence levels so the downstream onshape-skill can make informed decisions.

### 7. Output format: measurement.json

```json
{
  "part_name": "L390 Battery",
  "model_number": "L17C3P53",
  "official_specs": { "length": 291, "width": 81.5 },
  "scale": { "px_per_mm": 3.42 },
  "views": [{
    "image": "photo1.jpg",
    "angle": "top",
    "contour_mm": [[0,0], [291.3,0], ...],
    "features": [
      { "type": "hole", "center": [14.35, -4], "radius": 1.25 }
    ],
    "source": "opencv+user_overlay"
  }],
  "caliper_readings": [
    { "location": "main body thickness", "value_mm": 6.7, "source": "gemini_ocr" }
  ]
}
```

### 8. Project structure

```
tools/measure/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── requirements.txt          # opencv-python, numpy
├── src/
│   ├── server/
│   │   ├── index.ts          # Express server entry
│   │   ├── db.ts             # SQLite setup + migrations
│   │   ├── geminiKeys.ts     # API key pool (user's design)
│   │   ├── geminiClient.ts   # Gemini API wrapper
│   │   ├── routes/
│   │   │   ├── projects.ts   # CRUD for measurement projects
│   │   │   ├── photos.ts     # Photo upload + management
│   │   │   ├── analyze.ts    # AI analysis pipeline trigger
│   │   │   └── keys.ts       # API key management
│   │   ├── services/
│   │   │   ├── ocr.ts        # Gemini OCR service
│   │   │   ├── search.ts     # Gemini WebSearch service
│   │   │   ├── overlay.ts    # Overlay interpretation service
│   │   │   ├── opencv.ts     # Python subprocess wrapper
│   │   │   └── fusion.ts     # Multi-source fusion engine
│   │   └── python/
│   │       └── edge_detect.py  # OpenCV edge detection script
│   ├── client/
│   │   ├── index.html
│   │   ├── main.ts           # Frontend entry
│   │   ├── canvas/
│   │   │   ├── PhotoLayer.ts    # Photo rendering + pan/zoom
│   │   │   ├── DrawingLayer.ts  # Overlay drawing tools
│   │   │   └── FeatureMarker.ts # Feature annotation UI
│   │   ├── tools/
│   │   │   ├── ScaleTool.ts     # Two-point scale calibration
│   │   │   ├── PolylineTool.ts  # Line segment drawing
│   │   │   ├── ArcTool.ts       # Three-point arc drawing
│   │   │   ├── HoleTool.ts      # Circle/hole marking
│   │   │   └── SelectTool.ts    # Select + edit existing shapes
│   │   ├── state/
│   │   │   └── store.ts         # Client state management
│   │   └── api/
│   │       └── client.ts        # API client for backend
│   └── shared/
│       └── types.ts          # Shared TypeScript types
├── tests/
│   ├── e2e/
│   │   ├── setup.ts
│   │   ├── photo-upload.test.ts
│   │   ├── drawing-tools.test.ts
│   │   ├── scale-calibration.test.ts
│   │   ├── ai-pipeline.test.ts
│   │   └── export.test.ts
│   └── unit/
│       ├── geminiKeys.test.ts
│       ├── fusion.test.ts
│       └── opencv.test.ts
├── data/                     # SQLite DB + uploaded photos (gitignored)
│   └── .gitkeep
└── measure.db                # SQLite database
```

## Risks / Trade-offs

**[OpenCV edge detection fails on noisy photos]** → Mitigation: User overlay drawing provides the ROI hint; if OpenCV still fails, fall back to user drawing coordinates directly (already mm-calibrated via scale tool). Show confidence indicator in UI.

**[Gemini API rate limits despite key pool]** → Mitigation: 5 keys with round-robin + 429 failover. Usage tracking in SQLite enables monitoring. Worst case: sequential fallback instead of parallel.

**[Python not in PATH on Windows]** → Mitigation: Check Python availability on server startup, show clear error with install instructions. Support both `python` and `python3` commands.

**[Large photo files slow down processing]** → Mitigation: Resize photos server-side before sending to Gemini (max 2048px longest edge). Keep originals for OpenCV (higher res = better edge detection).

**[Scale calibration accuracy depends on photo angle]** → Mitigation: Warn user if photo appears to have perspective distortion. Recommend flat top-down shots with ruler parallel to part edges. Future: perspective correction.
