# Photo-to-CAD Workflow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a photo-to-CAD workflow to the onshape-skill so it can read reference photos, search online by model number, and generate multi-part FeatureScript code with interactive dimension confirmation.

**Architecture:** Pure skill text enhancement — modify SKILL.md and reference.md to teach the skill a new four-phase workflow (Measure → Research → Confirm → Generate). No external dependencies, no new files beyond the two existing skill documents.

**Tech Stack:** FeatureScript 2909, Claude multimodal vision, WebSearch/WebFetch

**Spec:** `docs/superpowers/specs/2026-03-16-photo-to-cad-workflow-design.md`

---

## Chunk 1: SKILL.md Updates

### Task 1: Update allowed-tools header

**Files:**
- Modify: `SKILL.md:5`

- [ ] **Step 1: Add WebSearch and WebFetch to allowed-tools**

Change line 5 from:
```
allowed-tools: Read, Glob, Grep, Write, Bash
```
To:
```
allowed-tools: Read, Glob, Grep, Write, Bash, WebSearch, WebFetch
```

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "feat: add WebSearch and WebFetch to allowed-tools"
```

---

### Task 2: Add Photo-to-CAD Workflow section to SKILL.md

**Files:**
- Modify: `SKILL.md` (insert after line 15, before "## IMPORTANT Rules")

- [ ] **Step 1: Add the Photo-to-CAD Workflow section**

Insert the following section between "## Input Processing" and "## IMPORTANT Rules":

```markdown
## Photo-to-CAD Workflow

When the user provides a **folder of reference photos** and/or a **model number**, follow this four-phase workflow to generate FeatureScript code.

### Overview

```
User Input
  ├─ Photo folder path ──→ [Measure]
  ├─ Model number ──→ [Research]
  └─ Or both

[Measure] → [Research] → [Interactive Confirm] → [Generate]
```

### Phase 1: Measure — Photo Analysis

1. **Discover images** — Use Glob to find `*.jpg`, `*.png`, `*.webp` in the given folder. Process up to 10-15 images. Prioritize photos with scale markers and distinct angles. Skip near-duplicates.

2. **Full scan** — Read all selected photos. Identify:
   - What product is this? How many main parts?
   - General shape of each part (curves, angles, transitions — NOT rectangles)

3. **Scale calibration** — Find rulers, calipers, or known objects in photos.
   - Calculate px/mm ratio from known scale markings
   - Cross-validate across multiple photos
   - If no scale marker: ask user for a known reference (credit card 85.6×53.98mm, coin)
   - If none available: warn user dimensions will be proportional estimates only

4. **Shape characterization** (critical for model quality)
   - Characterize overall shape type: rounded rectangle, trapezoid, organic curve, etc.
   - Identify key dimensions and proportional relationships for skPolyline construction
   - Surface transitions: flat vs curved, fillet radii estimates
   - Thickness variation: tapered edges, gradual changes
   - Note: Vision provides approximate shape understanding, not pixel-precise measurement. The confirmation step compensates.

5. **Feature detection**
   - Key/button layouts (positions, spacing, size differences)
   - Holes, ports, vents, slots
   - Surface textures (grilles, grooves)

6. **Multi-angle synthesis**
   - Auto-classify view angle (front/side/top/45°/back)
   - Each angle contributes different dimensions (front→width+height, side→depth+height, top→width+depth)
   - Cross-validate: same dimension from multiple photos → average + confidence

Output per part — a **Part Modeling Guide**:
```
Part: [name]
Overall: [L] × [W] × [H or thickness profile]
Profile: shape type + key dimensions for skPolyline
Surface: curvature notes (arcs, tapers, draft angles)
Features:
  - [type], [position], [dimensions]
Source: [which photos]
Confidence: [high/medium/low per dimension]
```

### Phase 2: Research — Model Number Search

Triggered when user provides a model number. Use WebSearch and WebFetch.

Search strategy (in order):
1. `"{model}" specifications dimensions mm` → official dimensions, weight, materials
2. `"{model}" teardown disassembly` / `"{model}" ifixit` → internal structure, part composition
3. `"{model}" review photos` → angles not in user photos (side, back, bottom)
4. `"{model}" 3D model CAD drawing` → existing models for proportion reference

**Integration rules:**
- Official spec dimensions override photo-measured dimensions (higher accuracy)
- Photo-measured contour/shape details override web data (more authentic to actual object)
- On conflict: list both sources with values, let user decide

### Phase 3: Interactive Confirmation

Present each part's data for user confirmation, one part per round:

```
━━━ Part [N/total]: [Part Name] ━━━

Overall Dimensions
  Length: [value] ([source])
  Width: [value] ([source])
  Height: [value] ([source], confidence: [level])

Profile
  [shape description and key dimensions]
  [curvature / taper / draft angle notes]

Features
  1. [feature] — [dimensions]
  2. [feature] — [dimensions]

Needs Confirmation
  - [items with low confidence or single-source data]

→ Confirm / Correct which values?
```

**Rules:**
- User says "OK" → proceed to next part
- User gives corrections → update values, re-display that part
- User can skip or merge parts
- All parts confirmed before Generate phase

**Confidence levels:**
- **High** — official spec OR multi-photo cross-validated
- **Medium** — single photo with scale marker
- **Low** — estimated, no direct reference

### Phase 4: Generate — FeatureScript Output

Generate one Feature Studio code block per confirmed part.

**Modeling order per part:**
1. Base shape — skPolyline for main profile, extrude base volume
2. Profile refinement — loft for curves, draft angle for tapers, multi-section loft for thickness gradients
3. Subtractive features — shell for hollowing, boolean subtract for openings/recesses
4. Detail features — holes, grilles, chamfers, fillets
5. Pattern features — linearPattern/circularPattern for arrays

**Quality checks after generation:**
- v2909 syntax compliance
- All fallible operations have try blocks
- Dimensions match confirmed values
- Profile point sequences valid (no crossings, no micro-segments)

### Fallback Strategies

- **No scale marker, no reference object** → rely on web-searched official dimensions only. If neither available, warn user dimensions are proportional estimates.
- **Web search returns no results** → proceed with photo-only measurements. Inform user accuracy depends on photo quality.
- **User skips all parts** → abort Generate phase, offer to restart with different photos.
- **Too many images (>15)** → process first 10-15, prioritizing scale markers and distinct angles. Inform user which were skipped.

### Known Limitations

- Vision is approximate, not pixel-precise — all dimensions require user confirmation
- Internal mechanisms and moving parts cannot be captured from external photos
- Organic/freeform surfaces are harder to parameterize than geometric shapes
- Each part is modeled independently — no assembly relationships
```

- [ ] **Step 2: Verify SKILL.md structure is coherent**

Read the full file and confirm the new section fits logically between Input Processing and IMPORTANT Rules.

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "feat: add photo-to-cad workflow section to SKILL.md"
```

---

### Task 3: Update Input Processing section in SKILL.md

**Files:**
- Modify: `SKILL.md:12-15`

- [ ] **Step 1: Expand Input Processing to include photo folder and model number inputs**

Replace the current Input Processing section:
```markdown
## Input Processing

1. **If given an image path**: Read and analyze the image to understand the geometry, dimensions, and features
2. **If given a description**: Parse the requirements and create appropriate 3D geometry
```

With:
```markdown
## Input Processing

1. **If given a photo folder path** (with optional model number): Follow the **Photo-to-CAD Workflow** below
2. **If given a single image path**: Read and analyze the image to understand the geometry, dimensions, and features
3. **If given a description**: Parse the requirements and create appropriate 3D geometry
4. **If given a model number only**: Use the Research phase from the Photo-to-CAD Workflow to gather specs, then generate code
```

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "feat: update input processing to support photo folder and model number"
```

---

## Chunk 2: reference.md Updates

### Task 4: Add Photo-to-CAD keyboard case study to reference.md

**Files:**
- Modify: `reference.md` (append after line 293, before end of file)

- [ ] **Step 1: Add the Photo-to-CAD Example section**

Append the following to reference.md:

````markdown

## Photo-to-CAD Example: Keyboard Enclosure

This example shows the complete workflow from photo analysis to FeatureScript, modeling a keyboard upper case.

### Step 1: Photo Analysis Result

From analyzing 6 photos with a ruler visible:
```
Part: Keyboard Upper Case
Overall: 440mm × 150mm × front 8mm tapering to rear 25mm
Profile: rounded rectangle, corner R8, front edge 15° bevel
Surface: top has subtle convex arc (center ~1.5mm higher than edges)
Features:
  - Key area recess: 400mm × 120mm, depth 1.2mm, edge R1
  - Status LED holes: 3× ∅2mm, spacing 8mm, top-right area
  - Rear vent slots: 12× 1.5mm wide, 15mm long, spacing 3mm
Source: front view, side view, top view, detail shots
Confidence: overall dims — high, arc height — medium, bevel angle — medium
```

### Step 2: Generated FeatureScript

```featurescript
FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "KeyboardUpperCase" }
export const keyboardUpperCase = defineFeature(function(context is Context, id is Id, definition is map)
    precondition {}
    {
        // === Dimensions from photo analysis (confirmed by user) ===
        var bodyLength = 440 * millimeter;
        var bodyWidth = 150 * millimeter;
        var frontHeight = 8 * millimeter;
        var rearHeight = 25 * millimeter;
        var cornerRadius = 8 * millimeter;
        var bevelAngle = 15 * degree;
        var arcHeight = 1.5 * millimeter;

        // === 1. Base profile — NOT a rectangle, use skPolyline for tapered side ===
        var sideSketch = newSketchOnPlane(context, id + "sideSketch", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 1, 0))
        });

        // Side profile: front thin, rear thick, with front bevel
        var bevelLen = frontHeight / tan(bevelAngle);
        skPolyline(sideSketch, "sideProfile", {
            "points" : [
                vector(0, 0) * millimeter,                          // front bottom
                vector(bodyLength, 0) * millimeter,                 // rear bottom
                vector(bodyLength, rearHeight) * millimeter,        // rear top
                vector(bevelLen, frontHeight) * millimeter,         // front top (after bevel)
                vector(0, frontHeight - bevelLen * tan(bevelAngle)) * millimeter  // front bevel start
            ]
        });
        skSolve(sideSketch);

        opExtrude(context, id + "baseExtrude", {
            "entities" : qSketchRegion(id + "sideSketch"),
            "direction" : vector(0, 1, 0),
            "endBound" : BoundingType.BLIND,
            "endDepth" : bodyWidth
        });

        // === 2. Round the vertical corners ===
        try { opFillet(context, id + "cornerFillet", {
            "entities" : qParallelEdges(qCreatedBy(id + "baseExtrude", EntityType.EDGE), vector(0, 0, 1)),
            "radius" : cornerRadius
        }); }

        // === 3. Key area recess ===
        var recessSketch = newSketchOnPlane(context, id + "recessSketch", {
            "sketchPlane" : plane(vector(0, 0, rearHeight) * millimeter, vector(0, 0, 1))
        });

        var recessLength = 400 * millimeter;
        var recessWidth = 120 * millimeter;
        var offsetX = (bodyLength - recessLength) / 2;
        var offsetY = (bodyWidth - recessWidth) / 2;

        skRectangle(recessSketch, "recess", {
            "firstCorner" : vector(offsetX, offsetY),
            "secondCorner" : vector(offsetX + recessLength, offsetY + recessWidth)
        });
        skSolve(recessSketch);

        opExtrude(context, id + "recessCut", {
            "entities" : qSketchRegion(id + "recessSketch"),
            "direction" : vector(0, 0, -1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : 1.2 * millimeter
        });

        try { opBoolean(context, id + "recessBool", {
            "tools" : qCreatedBy(id + "recessCut"),
            "targets" : qCreatedBy(id + "baseExtrude"),
            "operationType" : BooleanOperationType.SUBTRACTION
        }); }

        try { opFillet(context, id + "recessFillet", {
            "entities" : qCreatedBy(id + "recessCut", EntityType.EDGE),
            "radius" : 1 * millimeter
        }); }

        // === 4. Status LED holes ===
        var ledSketch = newSketchOnPlane(context, id + "ledSketch", {
            "sketchPlane" : plane(vector(0, 0, rearHeight) * millimeter, vector(0, 0, 1))
        });

        var ledStartX = bodyLength - 30 * millimeter;
        var ledY = 15 * millimeter;
        for (var i = 0; i < 3; i += 1)
        {
            skCircle(ledSketch, "led" ~ i, {
                "center" : vector(ledStartX + i * 8 * millimeter, ledY),
                "radius" : 1 * millimeter   // ∅2mm
            });
        }
        skSolve(ledSketch);

        opExtrude(context, id + "ledCut", {
            "entities" : qSketchRegion(id + "ledSketch"),
            "direction" : vector(0, 0, -1),
            "endBound" : BoundingType.THROUGH_ALL
        });

        try { opBoolean(context, id + "ledBool", {
            "tools" : qCreatedBy(id + "ledCut"),
            "targets" : qAllModifiableSolidBodies(),
            "operationType" : BooleanOperationType.SUBTRACTION
        }); }

        // === 5. Rear vent slots ===
        var ventSketch = newSketchOnPlane(context, id + "ventSketch", {
            "sketchPlane" : plane(vector(bodyLength, 0, 0) * millimeter, vector(1, 0, 0))
        });

        var ventWidth = 1.5 * millimeter;
        var ventLength = 15 * millimeter;
        var ventSpacing = 3 * millimeter;
        var ventStartY = (bodyWidth - 12 * ventSpacing) / 2;

        for (var i = 0; i < 12; i += 1)
        {
            var vy = ventStartY + i * ventSpacing;
            skRectangle(ventSketch, "vent" ~ i, {
                "firstCorner" : vector(vy, rearHeight * 0.3),
                "secondCorner" : vector(vy + ventWidth, rearHeight * 0.3 + ventLength)
            });
        }
        skSolve(ventSketch);

        opExtrude(context, id + "ventCut", {
            "entities" : qSketchRegion(id + "ventSketch"),
            "direction" : vector(1, 0, 0),
            "endBound" : BoundingType.BLIND,
            "endDepth" : 5 * millimeter
        });

        try { opBoolean(context, id + "ventBool", {
            "tools" : qCreatedBy(id + "ventCut"),
            "targets" : qAllModifiableSolidBodies(),
            "operationType" : BooleanOperationType.SUBTRACTION
        }); }
    });
```

### Key Takeaways

1. **Side profile uses skPolyline** — the keyboard is NOT a box, it tapers from rear to front with a bevel
2. **Modeling order**: base shape → corner fillets → recess → holes → vents (large to small)
3. **All boolean/fillet operations wrapped in try** — prevents cascade failures
4. **Dimensions hardcoded** from confirmed photo analysis — no parameters needed for a specific product model
5. **Features positioned relative to body dimensions** — not absolute coordinates
````

- [ ] **Step 2: Verify the example code follows all SKILL.md rules**

Check:
- FeatureScript 2909 header
- ASCII-only Feature Type Name
- try blocks on all fillet/boolean
- skPolyline for non-rectangular profile
- No deprecated parameter syntax

- [ ] **Step 3: Commit**

```bash
git add reference.md
git commit -m "docs: add photo-to-cad keyboard case study example"
```

---

### Task 5: Add multi-part modeling example to reference.md

**Files:**
- Modify: `reference.md` (append after the keyboard case study)

- [ ] **Step 1: Add multi-part teardown example**

Append the following section:

````markdown

## Multi-Part Modeling from Photos

When photo analysis identifies multiple parts, generate each as an independent Feature Studio script.

### Part Decomposition Strategy

1. **Identify separable components** — upper case, lower case, battery cover, screen bezel, etc.
2. **Model each independently** — no cross-references between Feature Studio scripts
3. **Use consistent coordinate origin** — all parts share the same origin point for later assembly alignment
4. **Name clearly** — Feature Type Name reflects the part: `UpperCase`, `LowerCase`, `BatteryDoor`

### Example: Two-Part Enclosure

**Part 1: Upper Shell** — modeled as shown in keyboard case study above

**Part 2: Lower Shell** — follows same pattern:

```featurescript
FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "KeyboardLowerCase" }
export const keyboardLowerCase = defineFeature(function(context is Context, id is Id, definition is map)
    precondition {}
    {
        // Same overall footprint as upper case for alignment
        var bodyLength = 440 * millimeter;
        var bodyWidth = 150 * millimeter;
        var lowerHeight = 5 * millimeter;
        var cornerRadius = 8 * millimeter;
        var wallThickness = 1.5 * millimeter;

        // Base plate
        var baseSketch = newSketchOnPlane(context, id + "baseSketch", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        skRectangle(baseSketch, "base", {
            "firstCorner" : vector(0, 0) * millimeter,
            "secondCorner" : vector(bodyLength, bodyWidth)
        });
        skSolve(baseSketch);

        opExtrude(context, id + "baseExtrude", {
            "entities" : qSketchRegion(id + "baseSketch"),
            "direction" : vector(0, 0, -1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : lowerHeight
        });

        // Round corners to match upper case
        try { opFillet(context, id + "cornerFillet", {
            "entities" : qParallelEdges(qCreatedBy(id + "baseExtrude", EntityType.EDGE), vector(0, 0, 1)),
            "radius" : cornerRadius
        }); }

        // Shell to create tray
        try { opShell(context, id + "shell1", {
            "entities" : qClosestTo(
                qCreatedBy(id + "baseExtrude", EntityType.FACE),
                vector(bodyLength/2, bodyWidth/2, 0) * millimeter
            ),
            "thickness" : wallThickness
        }); }

        // Screw bosses at 4 corners
        var bossSketch = newSketchOnPlane(context, id + "bossSketch", {
            "sketchPlane" : plane(vector(0, 0, -lowerHeight) * millimeter, vector(0, 0, 1))
        });

        var bossInset = 15 * millimeter;
        var bossRadius = 4 * millimeter;
        var screwRadius = 1.25 * millimeter;  // M2.5
        var corners = [
            vector(bossInset, bossInset),
            vector(bodyLength - bossInset, bossInset),
            vector(bodyLength - bossInset, bodyWidth - bossInset),
            vector(bossInset, bodyWidth - bossInset)
        ];

        for (var i = 0; i < 4; i += 1)
        {
            skCircle(bossSketch, "boss" ~ i, {
                "center" : corners[i],
                "radius" : bossRadius
            });
            skCircle(bossSketch, "screw" ~ i, {
                "center" : corners[i],
                "radius" : screwRadius
            });
        }
        skSolve(bossSketch);

        // Extrude bosses up to meet upper case
        opExtrude(context, id + "bossExtrude", {
            "entities" : qSketchRegion(id + "bossSketch"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : lowerHeight - wallThickness
        });

        try { opBoolean(context, id + "bossUnion", {
            "tools" : qCreatedBy(id + "bossExtrude"),
            "targets" : qCreatedBy(id + "baseExtrude"),
            "operationType" : BooleanOperationType.UNION
        }); }
    });
```

### Coordination Between Parts

- Both parts use the same `bodyLength` (440mm) and `bodyWidth` (150mm)
- Same `cornerRadius` (8mm) ensures visual consistency
- Screw boss positions in lower case align with through-holes in upper case
- Shared coordinate origin allows assembly in Onshape Assembly Studio
````

- [ ] **Step 2: Commit**

```bash
git add reference.md
git commit -m "docs: add multi-part modeling example for photo-to-cad workflow"
```

---

### Task 6: Add skPolyline best practices to reference.md

**Files:**
- Modify: `reference.md` (append after multi-part example)

- [ ] **Step 1: Add skPolyline profile best practices**

Append the following section:

````markdown

## skPolyline Profile Best Practices

When modeling from photos, `skPolyline` is essential for capturing real-world outlines that aren't simple rectangles.

### Closed Profile for Extrusion

Always close the polyline by making the last point equal to the first, or use separate line/arc segments that form a closed loop:

```featurescript
// Laptop palm rest cross-section — tapered with rounded front edge
skPolyline(sketch, "palmRestProfile", {
    "points" : [
        vector(0, 0) * millimeter,                    // bottom-left
        vector(300, 0) * millimeter,                   // bottom-right
        vector(300, 18) * millimeter,                  // rear top (thick end)
        vector(280, 18) * millimeter,                  // start of taper
        vector(20, 6) * millimeter,                    // front area (thin end)
        vector(0, 6) * millimeter                      // front-left
    ]
});
// Add arc for rounded front edge separately
skArc(sketch, "frontArc", {
    "start" : vector(0, 6) * millimeter,
    "mid" : vector(-2, 3) * millimeter,
    "end" : vector(0, 0) * millimeter
});
```

### Guidelines

1. **Minimum segment length** — Keep segments at least 0.5mm. Smaller segments cause solver issues.
2. **No self-intersections** — Points must trace the outline without crossing.
3. **Combine with arcs** — Use `skArc` for rounded sections rather than many short polyline segments.
4. **Orientation matters** — For extrusion, the profile plane normal should match the extrude direction.
5. **Use proportional relationships** — Express point positions relative to overall dimensions, not absolute values. This makes it easier to adjust if measurements are corrected.
````

- [ ] **Step 2: Commit**

```bash
git add reference.md
git commit -m "docs: add skPolyline best practices for photo-to-cad profiles"
```

---

## Post-Implementation

- [ ] **Final review: Read both SKILL.md and reference.md end-to-end**

Verify:
- New sections integrate cleanly with existing content
- No contradictions between old and new material
- All FeatureScript examples follow v2909 rules
- All fillet/loft/boolean have try blocks
- Feature Type Names are ASCII-only

- [ ] **Final commit if any cleanup needed**
