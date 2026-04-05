## Context

The onshape-skill measurement tool is a single-page application (SPA) built with vanilla TypeScript, Canvas API, and Three.js. All styling lives in a single `<style>` block inside `index.html`. The layout uses a fixed three-column design (sidebar | canvas workspace | properties panel) optimised for a 1280px+ desktop screen. No responsive breakpoints exist today.

The primary mobile use case: a user takes a photo of a metal/plastic part with their phone, opens the tool in their mobile browser, uploads (or directly captures) the photo, annotates the contour and reference dimensions, and sends the result to the AI for dimension extraction — all without leaving the field.

Constraint: No build changes, no new dependencies. All CSS changes go into the existing `<style>` block. The file input is already hidden and triggered programmatically, so adding `capture` is a one-line change.

## Goals / Non-Goals

**Goals:**
- Full usability at 375px (iPhone SE) and 390px (iPhone 14) viewport widths
- Direct camera capture on mobile (rear camera default)
- Touch-friendly tap targets (min 44×44px)
- Canvas drawing works with touch events (finger drawing on mobile)
- CAD preview modal resizes correctly on small screens
- Wizard overlay scrollable and usable on mobile
- No regression on desktop

**Non-Goals:**
- Native app experience or PWA installation flow
- Offline support
- Swipe gesture navigation (too complex for canvas-heavy tool; bottom nav tabs are simpler)
- Custom touch drawing library (Canvas already receives touch events if we forward them)

## Decisions

### 1. Bottom navigation tabs (not hamburger menu)

**Decision:** On mobile, replace the three-column layout with a single-panel view controlled by three bottom nav tabs: Photos | Canvas | Properties.

**Rationale:** The canvas workspace is the primary interaction surface. A hamburger menu hides content behind an extra tap. Bottom tabs give one-tap access to each panel and follow iOS/Android native app conventions. Three tabs map cleanly to the three existing panels.

**Alternative considered:** Horizontal swipe between panels — rejected because the canvas itself uses touch for drawing, creating gesture conflicts.

### 2. CSS-only responsive layout (no JS layout manager)

**Decision:** Use CSS media queries (`max-width: 768px`) and CSS Grid/Flexbox to restructure the layout. JS only sets `data-active-tab` attribute on `<body>`; CSS handles the rest.

**Rationale:** Keeps the approach consistent with the existing pure-CSS styling. No new JS module, no state machine changes. The tab switching logic is ~15 lines of JS added to `main.ts`.

### 3. Touch event forwarding for canvas drawing

**Decision:** Add a `touchstart`/`touchmove`/`touchend` → `mousedown`/`mousemove`/`mouseup` synthetic event forwarder on the canvas element.

**Rationale:** All existing drawing tools listen for mouse events. Forwarding touch events as synthetic mouse events means zero changes to the tool implementations themselves. Canvas coordinates are calculated from `clientX/Y` which works identically for both.

**Alternative considered:** Rewriting tools to handle PointerEvents — rejected as too large a scope change.

### 4. Viewport and canvas scaling

**Decision:** The canvas is sized via JS to fill its container. On mobile the container will be 100vw tall (minus top bar + bottom nav). No changes to canvas sizing logic needed — it already reads container dimensions.

**Rationale:** The existing `resizeCanvas()` function is called on `window.resize`. Adding a ResizeObserver on the canvas container is more reliable for mobile (browser chrome show/hide), so we'll swap to ResizeObserver.

### 5. Three.js preview modal

**Decision:** The preview modal is `position: fixed; width: 80%; height: 80%`. On mobile, change it to `width: 95vw; height: 70vh`. Three.js already calls `renderer.setSize()` on resize; we just need to dispatch a `resize` event when the modal opens.

## Risks / Trade-offs

- **Canvas drawing accuracy on mobile** — finger touch has ~5-10px radius vs mouse pixel precision. Mitigation: existing snap/grid features help; document in tool hint overlay.
- **iOS Safari 100vh bug** — `100vh` includes browser chrome. Mitigation: use `dvh` (dynamic viewport height) with `vh` fallback via CSS `@supports`.
- **Bottom nav overlaps fixed overlays** — wizard, settings, code modals use `position: fixed`. Mitigation: add `padding-bottom: 56px` to all fixed overlays on mobile.

## Migration Plan

1. Edit `index.html`: add responsive CSS, bottom nav markup, touch forwarding script, camera capture attribute
2. Edit `CadPreview.ts`: dispatch resize on modal open
3. Build: `npm run build` in `tools/measure/`
4. Deploy: push to RPi via GitHub Actions CI/CD

No rollback risk — all changes are additive CSS/HTML. Desktop layout unchanged.

## Open Questions

- Should we show a "tap to draw" hint overlay on first mobile use? (deferred — can add in follow-up)
