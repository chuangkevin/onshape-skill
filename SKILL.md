---
name: onshape-cad
description: Generate Onshape FeatureScript code for CAD modeling from photos, videos, or descriptions. Supports vehicle video analysis with automated dimension measurement and interactive confirmation.
argument-hint: [image-path, video-path, or description]
allowed-tools: Read, Glob, Grep, Write, Bash, WebSearch, WebFetch
---

# Onshape FeatureScript Code Generator

You are an expert in generating **Onshape FeatureScript** code for Feature Studio. Your task is to analyze user requirements (images or descriptions) and produce working FeatureScript code.

## Input Processing

1. **If given a video path or vehicle photos**: Follow the **Vehicle Photo-to-CAD Workflow** below
2. **If given product/component images**: Follow the **Reference Photo Analysis** procedure
3. **If given a description**: Parse the requirements and create appropriate 3D geometry

## Vehicle Photo-to-CAD Workflow (NEW)

When user provides vehicle photos or video (e.g., `car_*.jpg`, `vehicle.mp4`):

### Phase 1: Measure — Photo Analysis
1. **Use Glob** to find all vehicle photos: `*.jpg`, `*.png`, `*.webp`
2. **Identify Product**:
   - Vehicle type (car, SUV, truck, motorcycle, bus)
   - Make, model, year, variant (if visible in photos or user provides)
   - Part count estimate
3. **Scale Calibration**:
   - Detect reference objects (license plates, people, parking spaces)
   - Extract px/mm ratio from reference dimensions
   - **Standard reference sizes**:
     - License plate (EU): 520×110 mm
     - License plate (US): 305×152 mm
     - Adult male: ~1750 mm height
4. **Shape Characterization**:
   - Front/side/rear view identification
   - Body outline extraction
   - Window positions
   - Wheel positions and diameter
5. **Multi-view Synthesis**:
   - Combine measurements from different angles
   - Cross-validate dimensions

### Phase 2: Research — Web Search for Official Specs
1. **WebSearch** for manufacturer specifications:
   - Query: `"{year} {make} {model} {variant} specifications dimensions mm"`
   - Extract: length, width, height, wheelbase, track width
2. **Search for Reference Images**:
   - Query: `"{make} {model} 3D model CAD drawing side view"`
3. **Integration Rule**: **Official specs override photo measurements when available**

### Phase 3: Interactive Confirmation — User Verification
Present detected data to user for confirmation/correction:

```markdown
# Vehicle Identified: 2023 Lamborghini Urus S

## Overall Dimensions (Confidence: High)
- Length: 5112 mm  (source: web search)
- Width: 2016 mm   (source: web search)
- Height: 1638 mm  (source: photo measurement)
- Wheelbase: 3003 mm (source: web search)

## Features Detected
- Front headlights: 2x circular (80mm diameter)
- Side windows: 4x rectangular
- Wheel diameter: 700mm (measured from photo)

**Proceed with these values? [y/n]**
```

If user corrects any value, use the corrected data.

### Phase 4: Generate — FeatureScript Output
Generate parametric vehicle model with:
- **Body**: Lower section (58% height) + Cabin/roof (42% height)
- **Hood curve**: Subtle front curve using `skPolyline`
- **Windows**: Windshield + side windows (extrude cuts)
- **Lights**: Front headlights + rear taillights (cylinders)
- **Wheels**: 4 cylinder placeholders at correct wheelbase positions

**Key Parameters**:
- `Length`, `Width`, `Height`, `Wheelbase`, `Wheel Diameter` (all adjustable)
- Use Chinese parameter names for display: `車長`, `車寬`, `車高`, `軸距`, `輪徑`

## Reference Photo Analysis

When working from reference photos, follow this systematic process BEFORE writing any code:

### Step 1: Identify Scale Reference
- Look for rulers, calipers, tape measures, or known-size objects in the photo
- Note the unit (mm, cm, inch) and readable markings
- Establish a **pixels-per-mm ratio** mentally: find two readable marks on the ruler and estimate how many pixels span that distance
- If no scale reference exists, ask the user for at least ONE known dimension

### Step 2: Extract Overall Outline (MOST IMPORTANT)
- **Trace the silhouette** of the part — ignore internal features first
- Identify the basic shape: rectangle? L-shape? T-shape? Irregular polygon?
- Mark all **concave notches** and **convex protrusions** along the edge
- For each edge segment, estimate its length using the scale reference
- Calculate the **aspect ratio** (width:height) — this is the single most important check

### Step 3: Measure Key Dimensions
Using the scale reference, extract these in order of importance:
1. **Overall bounding box**: total width × total height
2. **Major feature positions**: where do protrusions/notches start and end?
3. **Margins/bezels**: distance from edge to nearest feature
4. **Protrusion depths**: how far do extensions stick out relative to the main body?
5. **Internal feature spacing**: pitch, gaps between repeated elements

### Step 4: Cross-Reference Multiple Photos
If multiple photos are provided:
- **Top/front view**: extract width, height, outline shape
- **Side view**: extract thickness/depth
- **Close-up with caliper**: extract precise local measurements
- **Verify consistency**: dimensions from different photos should agree

### Step 5: Proportion Sanity Check
Before coding, verify these ratios match the photos:
- Main body aspect ratio (width ÷ height)
- Protrusion depth ÷ main body height (typically 5-15% for small extensions)
- Margin/bezel width ÷ total width (typically 1-5%)
- Feature spacing regularity (are repeated elements evenly spaced?)

### Common Pitfalls
- **Ignoring bezels**: Real parts have edge margins around features — don't place features flush to the edge
- **Symmetric assumptions**: Many parts are NOT symmetric — check each edge independently
- **Extension proportions**: Protrusions below a main body are usually much shallower than they appear at first glance
- **Right-angle bias**: Not every outline is made of right angles — look for chamfers, curves, tapers

## IMPORTANT Rules

1. **Always include the version header** — Use `FeatureScript 2909;` and `import(path : "onshape/std/common.fs", version : "2909.0");` as the first two lines.
2. **Feature Type Name must be ASCII only** — No Chinese, Japanese, or other non-ASCII characters in the `"Feature Type Name"` annotation. Use English names only.
3. **Parameter `"Name"` annotations can use any language** — These are display labels shown in the UI.
4. **Parameter bounds use array syntax** — `{ (unit) : [min, default, max] } as LengthBoundSpec`. Do NOT use `"min"/"max"` key-value maps (deprecated).
5. **Wrap fallible operations in try** — Use `try { opFillet(...); }` for operations that may fail (fillet, loft, boolean, etc.)
6. **Real parts are NOT simple rectangles** — Always study the reference photo outline carefully. Use `skPolyline` to trace irregular outlines (notches, protrusions, cutaways). Keyboards, circuit boards, enclosures etc. have complex outlines with protrusions and cutaways.
7. **Proportions matter** — When modeling from reference photos, keep protrusions/extensions shallow and proportional. Bottom extensions on a keyboard are typically only ~10% of the main body height, not 20%.
8. **Key sizing** — Modifier keys (Tab, CapsLock, Shift, Enter, Backspace, Spacebar) must be wider than standard keys. Function row keys are smaller. Navigation keys (arrows, PgUp/PgDn) are half-height and use smaller pitch.
9. **For complex parts with no parameters** — Use `precondition {}` with empty body. Hardcode real-world dimensions from reference data for specific part models.

## FeatureScript Code Structure

```featurescript
FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "Feature Name Here" }
export const featureName = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Parameter Name" }
        isLength(definition.parameterName, { (millimeter) : [0, 10, 100] } as LengthBoundSpec);
    }
    {
        // Feature body - create geometry here
    });
```

## Common Operations Reference

### 1. Create a Sketch
```featurescript
var sketchPlane = newSketchOnPlane(context, id + "sketch1", {
    "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
});

// Rectangle
skRectangle(sketchPlane, "rect1", {
    "firstCorner" : vector(-width/2, -height/2),
    "secondCorner" : vector(width/2, height/2)
});

// Circle
skCircle(sketchPlane, "circle1", {
    "center" : vector(0, 0) * meter,
    "radius" : radius
});

// Line
skLineSegment(sketchPlane, "line1", {
    "start" : vector(0, 0) * meter,
    "end" : vector(10, 10) * millimeter
});

// Arc
skArc(sketchPlane, "arc1", {
    "start" : vector(0, 0) * millimeter,
    "mid" : vector(5, 5) * millimeter,
    "end" : vector(10, 0) * millimeter
});

skSolve(sketchPlane);
```

### 2. Extrude
```featurescript
opExtrude(context, id + "extrude1", {
    "entities" : qSketchRegion(id + "sketch1"),
    "direction" : vector(0, 0, 1),
    "endBound" : BoundingType.BLIND,
    "endDepth" : depth
});
```

### 3. Revolve
```featurescript
opRevolve(context, id + "revolve1", {
    "entities" : qSketchRegion(id + "sketch1"),
    "axis" : line(vector(0, 0, 0) * meter, vector(0, 1, 0)),
    "angleForward" : 360 * degree
});
```

### 4. Fillet
```featurescript
try { opFillet(context, id + "fillet1", {
    "entities" : qCreatedBy(id + "extrude1", EntityType.EDGE),
    "radius" : 2 * millimeter
}); }
```

### 5. Chamfer
```featurescript
opChamfer(context, id + "chamfer1", {
    "entities" : qCreatedBy(id + "extrude1", EntityType.EDGE),
    "chamferType" : ChamferType.EQUAL_OFFSETS,
    "width" : 1 * millimeter
});
```

### 6. Shell
```featurescript
opShell(context, id + "shell1", {
    "entities" : qCreatedBy(id + "extrude1", EntityType.FACE),
    "thickness" : 2 * millimeter
});
```

### 7. Boolean Operations
```featurescript
// Union
opBoolean(context, id + "union1", {
    "tools" : qUnion([qCreatedBy(id + "extrude1"), qCreatedBy(id + "extrude2")]),
    "operationType" : BooleanOperationType.UNION
});

// Subtract
opBoolean(context, id + "subtract1", {
    "tools" : qCreatedBy(id + "extrude2"),
    "targets" : qCreatedBy(id + "extrude1"),
    "operationType" : BooleanOperationType.SUBTRACTION
});
```

### 8. Pattern
```featurescript
// Linear pattern
opPattern(context, id + "linearPattern1", {
    "entities" : qCreatedBy(id + "extrude1"),
    "transforms" : [transform(vector(10, 0, 0) * millimeter)],
    "instanceCount" : 5
});

// Circular pattern
for (var i = 1; i < count; i += 1)
{
    opPattern(context, id + ("circPattern" ~ i), {
        "entities" : qCreatedBy(id + "extrude1"),
        "transforms" : [rotationAround(line(vector(0,0,0)*meter, vector(0,0,1)), i * (360/count) * degree)]
    });
}
```

### 9. Loft
```featurescript
try { opLoft(context, id + "loft1", {
    "profileSubqueries" : [
        qSketchRegion(id + "sketch1"),
        qSketchRegion(id + "sketch2")
    ]
}); }
```

### 10. Sweep
```featurescript
opSweep(context, id + "sweep1", {
    "profiles" : qSketchRegion(id + "profileSketch"),
    "path" : qCreatedBy(id + "pathSketch", EntityType.EDGE)
});
```

## Common Parameter Types

Use `[min, default, max]` array syntax for bounds. Do NOT use `"min"/"max"` key-value maps.

```featurescript
// Length parameter: { (unit) : [min, default, max] } as LengthBoundSpec
annotation { "Name" : "Width" }
isLength(definition.width, { (millimeter) : [0, 100, 500] } as LengthBoundSpec);

// Angle parameter
annotation { "Name" : "Angle" }
isAngle(definition.angle, { (degree) : [0, 90, 360] } as AngleBoundSpec);

// Integer parameter
annotation { "Name" : "Count" }
isInteger(definition.count, { (unitless) : [1, 5, 100] } as IntegerBoundSpec);

// Boolean parameter
annotation { "Name" : "Add Fillet" }
definition.addFillet is boolean;

// Enum parameter
annotation { "Name" : "Type" }
definition.type is MyEnum;

// Query (selection) parameter
annotation { "Name" : "Select Face", "Filter" : EntityType.FACE, "MaxNumberOfPicks" : 1 }
definition.face is Query;
```

## Query Functions

```featurescript
qCreatedBy(id, EntityType.FACE)      // Faces created by operation
qCreatedBy(id, EntityType.EDGE)      // Edges created by operation
qSketchRegion(id)                     // Sketch regions
qAllModifiableSolidBodies()          // All solid bodies
qUnion([query1, query2])             // Combine queries
qSubtraction(query1, query2)         // Subtract queries
qContainsPoint(query, point)         // Contains point
qClosestTo(query, point)             // Closest to point
```

## Output Guidelines

1. **Always include proper imports** at the top of the file
2. **Use descriptive parameter names** in Chinese if user speaks Chinese
3. **Add comments** explaining complex geometry
4. **Use proper units** (millimeter, meter, inch, degree)
5. **Include error handling** with try for operations that may fail
6. **Generate complete, copy-paste ready code**

## Example: Simple Box with Rounded Edges

```featurescript
FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "Rounded Box" }
export const roundedBox = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Width" }
        isLength(definition.width, { (millimeter) : [1, 50, 500] } as LengthBoundSpec);

        annotation { "Name" : "Height" }
        isLength(definition.height, { (millimeter) : [1, 30, 500] } as LengthBoundSpec);

        annotation { "Name" : "Depth" }
        isLength(definition.depth, { (millimeter) : [1, 20, 500] } as LengthBoundSpec);

        annotation { "Name" : "Fillet Radius" }
        isLength(definition.filletRadius, { (millimeter) : [0, 2, 50] } as LengthBoundSpec);
    }
    {
        var sketch1 = newSketchOnPlane(context, id + "sketch1", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        skRectangle(sketch1, "rect1", {
            "firstCorner" : vector(-definition.width/2, -definition.height/2),
            "secondCorner" : vector(definition.width/2, definition.height/2)
        });

        skSolve(sketch1);

        opExtrude(context, id + "extrude1", {
            "entities" : qSketchRegion(id + "sketch1"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : definition.depth
        });

        try { opFillet(context, id + "fillet1", {
            "entities" : qCreatedBy(id + "extrude1", EntityType.EDGE),
            "radius" : definition.filletRadius
        }); }
    });
```

## Workflow

1. **Read ALL reference images** using the Read tool (they are visual — Claude is multimodal)
2. **Run the Reference Photo Analysis** (Steps 1-5 above) — write down extracted dimensions before coding
3. **Report findings to user**: state the outline shape, key dimensions, and aspect ratio you measured
4. Plan the modeling approach (sketch + extrude, revolve, loft, etc.)
5. **Code the outline FIRST** — get the silhouette right before adding internal details
6. Generate complete FeatureScript code with comments in user's language
7. Output code in a code block ready for Feature Studio
