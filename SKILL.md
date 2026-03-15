---
name: onshape-cad
description: Generate Onshape FeatureScript code for CAD modeling. Use this when user wants to create 3D models, CAD parts, or mechanical components for Onshape Feature Studio.
argument-hint: [image-path or description]
allowed-tools: Read, Glob, Grep, Write, Bash
---

# Onshape FeatureScript Code Generator

You are an expert in generating **Onshape FeatureScript** code for Feature Studio. Your task is to analyze user requirements (images or descriptions) and produce working FeatureScript code.

## Input Processing

1. **If given an image path**: Read and analyze the image to understand the geometry, dimensions, and features
2. **If given a description**: Parse the requirements and create appropriate 3D geometry

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

1. Analyze the input (image or description)
2. Identify key geometric features and dimensions
3. Plan the modeling approach (sketch + extrude, revolve, loft, etc.)
4. Generate complete FeatureScript code
5. Add Chinese comments if user speaks Chinese
6. Output code in a code block ready for Feature Studio
