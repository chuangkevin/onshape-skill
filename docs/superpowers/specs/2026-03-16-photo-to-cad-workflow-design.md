# Photo-to-CAD Workflow Design

## Summary

Enhance the onshape-skill to support a new workflow: read reference photos (with scale markers) and/or search online by model number, extract precise dimensions and contour profiles, interactively confirm with user, then generate multi-part FeatureScript code for Onshape Feature Studio.

## Motivation

Current skill requires users to manually describe dimensions and features. This upgrade enables:
- Direct photo input with automatic dimension extraction
- Online research by model number for specs, teardown images, and multi-angle references
- Higher fidelity 3D models by focusing on contour profiles, not just bounding-box dimensions
- Inspired by Zoo's Zookeeper CAD agent approach — photo input → quality 3D model output

## Approach

Pure skill enhancement (no external dependencies). Leverage Claude's multimodal vision for photo analysis and existing web tools (WebSearch/WebFetch) for online research. Keep the skill portable — text-only, no Python/OpenCV required.

## Workflow Overview

```
User Input
  ├─ Photo folder path ──→ [Measure]
  ├─ Model number ──→ [Research]
  └─ Or both

[Measure] → [Research] → [Interactive Confirm] → [Generate]
                                 ↕ (data merged with integration rules)

```

## Phase 1: Measure — Photo Dimension Extraction

### Input
- User provides folder path containing images (jpg/png/webp)
- Photos are of real objects with rulers, calipers, or known reference objects

### Image Discovery and Processing
- Use Glob to find images: `*.jpg`, `*.png`, `*.webp` in the given folder
- Practical limit: process up to 10-15 images per session (context window constraint)
- If more images exist, prioritize: photos with scale markers first, then distinct angles, skip near-duplicates
- Skip non-image files silently

### Process

1. **Full scan** — Read all photos, establish overall understanding
   - What product is this? How many main parts?
   - General shape of each part (curves, angles, transitions — NOT rectangles)

2. **Scale calibration** — Identify rulers/scale markers
   - Calculate px/mm ratio from known scale markings
   - Cross-validate when multiple photos have scale markers
   - If no scale marker: ask user for known reference (credit card, coin, etc.)

3. **Shape characterization** (critical for model quality)
   - Characterize overall shape type: rounded rectangle, trapezoid, organic curve, etc.
   - Identify key dimensions and proportional relationships for skPolyline construction
   - Surface transitions: flat vs curved, fillet radii estimates
   - Thickness variation: tapered edges, gradual changes
   - Note: Claude vision provides approximate shape understanding, not pixel-precise measurement. The interactive confirmation step compensates for this — user verifies all values

4. **Feature detection**
   - Key layouts (positions, spacing, size differences)
   - Holes, ports, vents, slots
   - Surface textures (grilles, grooves)

5. **Multi-angle synthesis**
   - Auto-classify view angle (front/side/top/45°/back)
   - Each angle contributes different dimensions
   - Cross-validate: same dimension from multiple photos → average + confidence

### Output Format (per part)
```
Part: Upper Case
Overall: 440mm × 150mm × front 8mm tapering to rear 25mm
Profile: skPolyline point sequence + corner R8
Surface: top micro-arc (center 1.5mm higher than edges)
Features:
  - Key area recess: depth 1.2mm, edge R1 fillet
  - Indicator LED holes ×3: ∅2mm, spacing 8mm
  - Front edge bevel: 15°
Source: photo_01 (front), photo_03 (side)
Confidence: overall dims — high, arc — low
```

## Phase 2: Research — Model Number Search

### Trigger
User provides a model number (e.g., "ThinkPad L390", "Keychron K2")

### Search Strategy (priority order)

1. **Official specifications**
   - Query: `"{model}" specifications dimensions mm`
   - Extract: precise dimensions, weight, materials from datasheets

2. **Teardown / internal structure**
   - Query: `"{model}" teardown disassembly`, `"{model}" ifixit`
   - Understand: part composition, assembly method, internal structure

3. **Multi-angle photos**
   - Query: `"{model}" review photos`
   - Focus on: side, back, angles not easily captured by user

4. **3D model / drawing references**
   - Query: `"{model}" 3D model CAD drawing`
   - Reference for proportions and structure if available

### Integration Rules
- Official spec dimensions > photo-measured dimensions (higher accuracy)
- Photo-measured contour details > web data (more authentic)
- On conflict: list both sources with values, let user decide

## Phase 3: Interactive Confirmation

### Display Format (per part, one round each)

```
━━━ Part 1/4: Upper Case ━━━

📐 Overall Dimensions
  Length: 440mm (official spec)
  Width: 150mm (official spec)
  Height: front 8mm → rear 25mm (photo, confidence: high)

📏 Profile
  Corner radius: R8mm (photo, confidence: medium)
  Top surface arc: center +1.5mm (photo, confidence: low)
  Front bevel: 15° (photo, confidence: medium)

🔧 Features
  1. Key area recess — depth 1.2mm, R1 fillet
  2. LED holes ×3 — ∅2mm, spacing 8mm
  3. Rear vent grille — 12 slots, width 1.5mm

⚠️ Needs Confirmation
  - Top arc from single photo only, suggest physical measurement
  - Front bevel angle may be 12°–18°

→ Confirm / Correct which values?
```

### Interaction Rules
- User says "OK" → next part
- User gives corrections → update and re-display that part
- User can skip parts or request merging parts
- All parts confirmed before entering Generate phase

### Confidence Levels
- **High** — official spec OR multi-photo cross-validated
- **Medium** — single photo with scale marker
- **Low** — estimated, no direct reference

## Phase 4: Generate — FeatureScript Output

### Modeling Order (per part)

1. **Base shape** — skPolyline for main profile, extrude base volume
2. **Profile refinement** — loft for curves, draft angle for tapers, multi-section loft for thickness gradients
3. **Subtractive features** — shell for hollowing, boolean subtract for openings/recesses
4. **Detail features** — holes, grilles, chamfers, fillets
5. **Pattern features** — linearPattern/circularPattern for key arrays, screw holes, etc.

### Code Standards (per existing SKILL.md)
- FeatureScript v2909
- Feature Type Name: ASCII only
- Parameter bounds: array syntax `[min, default, max]`
- All fillet/loft/boolean wrapped in try blocks
- Each part is independent, no cross-dependencies

### Output
- One FeatureScript code block per part
- Ready to paste into Onshape Feature Studio
- Clear part naming in comments and Feature Type Name

### Quality Checks (automatic after generation)
- v2909 syntax compliance
- All fallible operations have try blocks
- Dimensions match confirmed values
- Profile point sequences are valid (no crossings, no micro-segments)

## Skill Architecture Changes

### Modified Files
- **SKILL.md** — Add "Photo-to-CAD Workflow" section:
  - Four-phase workflow description (Measure/Research/Confirm/Generate)
  - Photo folder reading convention
  - Contour extraction guidelines (emphasize non-rectangular, use skPolyline)
  - Interactive confirmation format template
  - Confidence level definitions

- **reference.md** — Add examples:
  - Complete photo-to-FeatureScript example (keyboard case study)
  - Multi-part teardown and individual modeling example
  - Profile point sequence best practices

### No New Files Needed
- No new directory structure
- No external dependencies
- No OpenSpec config changes
- All existing FeatureScript syntax rules and examples preserved

## Skill Tool Requirements

The SKILL.md `allowed-tools` must be updated to include WebSearch and WebFetch for the Research phase:
```
allowed-tools: Read, Glob, Grep, Write, Bash, WebSearch, WebFetch
```

## Fallback Strategies

- **No scale marker found** → Ask user for a known reference object (credit card 85.6×53.98mm, coin). If none available, rely on web-searched official dimensions only. If neither available, warn user that dimensions are proportional estimates only.
- **Web search returns no results** → Proceed with photo-only measurements. Inform user that accuracy depends entirely on photo quality and scale markers.
- **User skips all parts** → Abort Generate phase, offer to restart with different photos or more information.
- **Too many images in folder** → Process first 10-15, prioritizing those with scale markers and distinct angles. Inform user which were skipped.

## Known Limitations

- Claude vision is approximate, not pixel-precise — all dimensions are estimates requiring user confirmation
- Internal mechanisms, moving parts, and assembly constraints cannot be captured from external photos alone
- Organic/freeform surfaces (e.g., ergonomic curves) are harder to parameterize than geometric shapes
- Generated FeatureScript models each part independently — no assembly relationships between parts

## Design Principles
- Portable: no external tools, pure skill text
- Accurate: target ±1-2mm with interactive confirmation as safety net
- Profile-first: shape characterization matters more than bounding boxes
- Multi-source: photos + web research, cross-validated
- Transparent: always show data source and confidence for every value
