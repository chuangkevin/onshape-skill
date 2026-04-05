## Why

The onshape-skill measurement tool is ideally used on mobile — users take photos of physical objects with their phone camera and need to annotate dimensions in the field. The current UI is desktop-only, making the tool effectively unusable on smartphones and tablets.

## What Changes

- Add mobile-first responsive CSS breakpoints to the three-panel workspace layout
- Replace the fixed 3-column layout with a stacked/tabbed layout on small screens
- Add `capture="environment"` to the file input to enable direct camera capture on mobile
- Scale canvas drawing and measurement overlays correctly at any screen width
- Make all tap targets at least 44×44px (WCAG AA touch target standard)
- Add a bottom navigation bar on mobile to switch between Photos / Canvas / Properties panels
- Ensure the Three.js CAD preview resizes correctly inside its modal on mobile
- Add `user-select: none` and touch-action hints to prevent accidental text selection during drawing
- Ensure the Wizard overlay is scrollable and usable at 375px width

## Capabilities

### New Capabilities

- `mobile-layout`: Responsive layout system — bottom nav, stacked panels, mobile breakpoints
- `camera-capture`: Direct camera access via `capture="environment"` on file input

### Modified Capabilities

<!-- No existing spec-level requirements are changing — this is purely a presentation/interaction layer addition -->

## Impact

- `tools/measure/src/client/index.html` — CSS overhaul + file input attribute + bottom nav markup
- `tools/measure/src/client/preview/CadPreview.ts` — Resize handler improvement for modal
- No API changes, no data model changes, no breaking changes
