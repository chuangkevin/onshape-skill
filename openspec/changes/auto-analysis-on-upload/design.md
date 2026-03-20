## Context

Photo Measurement Tool has a working backend (Express + Gemini API pool + OpenCV + SQLite) and frontend (Canvas layers + drawing tools + Wizard). UX audit found the manual workflow is the main problem. The tool will run on RPi 4 Docker.

## Goals / Non-Goals

**Goals**

- AI auto-detects ruler scale + contour on upload
- Wizard becomes confirm-only
- SSE progress during analysis

**Non-Goals**

- No 3D reconstruction
- No user auth
- No new DB schema changes

## Decisions

### 1. Upload triggers auto-analysis pipeline

When a photo is uploaded, the server immediately fires a background analysis:

```
Upload photo
    │
    ├──→ [Key A] Gemini: detect ruler (return pixel coords of markings + real distance)
    ├──→ [Key B] Gemini: OCR labels (model number, specs text)
    ├──→ [Key C] OpenCV: edge detection + contour extraction
    │
    ▼ (all parallel, SSE progress events)

Results stored in DB → frontend receives SSE events → updates UI
```

### 2. Gemini ruler detection prompt design

Critical prompt that asks Gemini to:

- Find any ruler/scale/caliper in the photo
- Return the pixel coordinates of two identifiable markings (e.g., 0cm and 30cm marks)
- Return the real-world distance between them
- Response format: JSON `{"found": true, "point_a": {"px_x": 123, "px_y": 456, "label": "0cm"}, "point_b": {"px_x": 789, "px_y": 456, "label": "30cm"}, "distance_mm": 300}`
- If no ruler found: `{"found": false}`

### 3. Wizard confirm flow

Old: Step 1 upload → Step 2 manual scale → Step 3 manual contour → Step 4 features → Step 5 analyze

New: Step 1 upload (auto-analysis starts) → Step 2 confirm scale (show AI result, edit if wrong) → Step 3 confirm contour (show AI contour, edit/redraw) → Step 4 confirm features + export

### 4. Right panel simplification

Wizard mode: remove the "操作流程" guide panel (wizard bar is sufficient). Keep only: photo angle, scale info, features, dimensions, actions.

Free mode: keep guide panel as-is.

### 5. Auto-analyze SSE endpoint

`POST /api/projects/:id/photos/:photoId/auto-analyze` returns SSE stream with events:

- `{step: "ruler", status: "running"}`
- `{step: "ruler", status: "done", result: {found: true, px_per_mm: 4.56, ...}}`
- `{step: "contour", status: "running"}`
- `{step: "contour", status: "done", result: {contour_px: [...], circles: [...]}}`
- `{step: "labels", status: "done", result: {model_number: "L17C3P53", ...}}`
- `{step: "complete", result: {all merged}}`

## Risks / Trade-offs

- **Gemini ruler detection accuracy** — may return wrong pixel coords. Mitigation: user can override in confirm step.
- **OpenCV contour may be noisy** — user can redraw in confirm step.
- **RPi 4 latency** — parallel Gemini calls + OpenCV resize to 1024px keeps total under 15 seconds.
