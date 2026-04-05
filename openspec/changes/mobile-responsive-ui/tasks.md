## 1. CSS Responsive Layout

- [ ] 1.1 Add CSS custom properties for mobile breakpoint and bottom nav height at top of `<style>` block
- [ ] 1.2 Add `@media (max-width: 768px)` breakpoint: stack `.workspace` panels vertically, hide sidebar and right panel by default
- [ ] 1.3 Add `.panel-active` class logic: only the active panel is visible on mobile (canvas active by default)
- [ ] 1.4 Fix all modals (wizard, settings, code, preview) to use `dvh` height with `vh` fallback and add `padding-bottom: 56px` on mobile
- [ ] 1.5 Increase toolbar button sizes to min 44×44px on mobile via media query
- [ ] 1.6 Fix project landing grid to be single-column on mobile (already uses `auto-fill minmax(220px)` — verify it works at 375px)

## 2. Bottom Navigation Bar

- [ ] 2.1 Add bottom nav HTML markup (`<nav id="bottomNav">`) with three tab buttons (Photos 📷, Canvas ✏️, Properties 📐) inside `<body>`, visible only on mobile via CSS
- [ ] 2.2 Add bottom nav CSS: fixed position, full width, 56px height, dark theme styling, active tab indicator
- [ ] 2.3 Add tab switching JS in `main.ts` (or inline `<script>`): click handler sets `data-active-tab` on `<body>`, CSS responds to show/hide panels

## 3. Camera Capture

- [ ] 3.1 Update file input: change `accept` to `accept="image/*"` and add `capture="environment"` attribute

## 4. Touch Drawing Support

- [ ] 4.1 Add touch-to-mouse event forwarding function on the canvas container: translate `touchstart/move/end` → synthetic `mousedown/move/up` events with correct `clientX/Y`
- [ ] 4.2 Add `touch-action: none` CSS to the canvas element to prevent browser scroll/zoom interference during drawing
- [ ] 4.3 Add `user-select: none` to canvas and toolbar to prevent text selection on long-press

## 5. CAD Preview Three.js Resize

- [ ] 5.1 In `CadPreview.ts`, dispatch a `resize` event on the window (or call `handleResize` directly) when the preview modal is opened, so Three.js recalculates canvas size correctly

## 6. Build and Verify

- [ ] 6.1 Run `npm run build` in `tools/measure/` — ensure no TypeScript errors
- [ ] 6.2 Manually verify at 375px width in browser DevTools: no horizontal scroll, bottom nav visible, canvas draws with simulated touch
- [ ] 6.3 Manually verify at 390px width — same checks
- [ ] 6.4 Verify desktop layout at 1280px is unchanged
- [ ] 6.5 Bump version in `tools/measure/package.json`

## 7. Commit and Deploy

- [ ] 7.1 Commit all changes with message `feat: mobile-responsive UI for measurement tool`
- [ ] 7.2 Push to GitHub — CI/CD deploys to RPi automatically
- [ ] 7.3 Verify deployed at `https://onshape.sisihome.org` on a real mobile device
