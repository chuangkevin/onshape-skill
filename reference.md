# FeatureScript Advanced Reference

## Common Mechanical Components

### Screw Hole Pattern
```featurescript
// Create mounting hole pattern
for (var i = 0; i < holeCount; i += 1)
{
    var angle = i * (360 / holeCount) * degree;
    var holeCenter = vector(
        boltCircleRadius * cos(angle),
        boltCircleRadius * sin(angle)
    );

    skCircle(sketch, "hole" ~ i, {
        "center" : holeCenter,
        "radius" : holeRadius
    });
}
```

### Thread Profile (Simplified)
```featurescript
// Helical thread approximation
annotation { "Feature Type Name" : "Simple Thread" }
export const simpleThread = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Major Diameter" }
        isLength(definition.majorDia, LENGTH_BOUNDS);

        annotation { "Name" : "Pitch" }
        isLength(definition.pitch, LENGTH_BOUNDS);

        annotation { "Name" : "Length" }
        isLength(definition.length, LENGTH_BOUNDS);
    }
    {
        var minorDia = definition.majorDia - 1.0825 * definition.pitch;

        // Create cylinder
        var sketch1 = newSketchOnPlane(context, id + "sketch1", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        skCircle(sketch1, "circle1", {
            "center" : vector(0, 0) * meter,
            "radius" : definition.majorDia / 2
        });

        skSolve(sketch1);

        opExtrude(context, id + "extrude1", {
            "entities" : qSketchRegion(id + "sketch1"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : definition.length
        });
    });
```

### Gear Tooth Profile (Involute Approximation)
```featurescript
function drawGearTooth(sketch is Sketch, toothId is string, module is ValueWithUnits, pressureAngle is ValueWithUnits, pitchRadius is ValueWithUnits, toothAngle is ValueWithUnits)
{
    var addendum = module;
    var dedendum = 1.25 * module;
    var baseRadius = pitchRadius * cos(pressureAngle);
    var outerRadius = pitchRadius + addendum;
    var rootRadius = pitchRadius - dedendum;

    // Simplified involute curve points
    var toothWidth = PI * module / 2;

    // Draw approximated tooth profile
    skArc(sketch, toothId ~ "_outer", {
        "start" : vector(outerRadius * cos(toothAngle - toothWidth/(2*pitchRadius)),
                         outerRadius * sin(toothAngle - toothWidth/(2*pitchRadius))),
        "mid" : vector(outerRadius * cos(toothAngle), outerRadius * sin(toothAngle)),
        "end" : vector(outerRadius * cos(toothAngle + toothWidth/(2*pitchRadius)),
                       outerRadius * sin(toothAngle + toothWidth/(2*pitchRadius)))
    });
}
```

### Enclosure with Snap Fits
```featurescript
// Snap fit tab
var tabWidth = 5 * millimeter;
var tabLength = 8 * millimeter;
var tabThickness = 1.5 * millimeter;
var undercut = 0.5 * millimeter;

var tabSketch = newSketchOnPlane(context, id + "tabSketch", {
    "sketchPlane" : plane(tabPosition, normal)
});

// Tab profile with undercut
skPolyline(tabSketch, "tabProfile", {
    "points" : [
        vector(0, 0) * millimeter,
        vector(tabLength, 0) * millimeter,
        vector(tabLength, tabThickness) * millimeter,
        vector(tabLength - 2*millimeter, tabThickness + undercut) * millimeter,
        vector(0, tabThickness) * millimeter
    ]
});

skSolve(tabSketch);
```

## Laptop Component Patterns

### Hinge Mechanism
```featurescript
annotation { "Feature Type Name" : "Laptop Hinge" }
export const laptopHinge = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Hinge Diameter" }
        isLength(definition.hingeDia, LENGTH_BOUNDS);

        annotation { "Name" : "Hinge Length" }
        isLength(definition.hingeLength, LENGTH_BOUNDS);

        annotation { "Name" : "Wall Thickness" }
        isLength(definition.wallThickness, LENGTH_BOUNDS);
    }
    {
        // Outer cylinder
        var sketch1 = newSketchOnPlane(context, id + "sketch1", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(1, 0, 0))
        });

        skCircle(sketch1, "outer", {
            "center" : vector(0, 0) * meter,
            "radius" : definition.hingeDia / 2
        });

        skCircle(sketch1, "inner", {
            "center" : vector(0, 0) * meter,
            "radius" : definition.hingeDia / 2 - definition.wallThickness
        });

        skSolve(sketch1);

        // Extrude tube
        opExtrude(context, id + "extrude1", {
            "entities" : qSubtraction(
                qSketchRegion(id + "sketch1", true),
                qContainsPoint(qSketchRegion(id + "sketch1"), vector(0, 0, 0) * meter)
            ),
            "direction" : vector(1, 0, 0),
            "endBound" : BoundingType.BLIND,
            "endDepth" : definition.hingeLength
        });
    });
```

### Keyboard Key Cap
```featurescript
annotation { "Feature Type Name" : "Keycap" }
export const keycap = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Key Width" }
        isLength(definition.keyWidth, LENGTH_BOUNDS);

        annotation { "Name" : "Key Height" }
        isLength(definition.keyHeight, LENGTH_BOUNDS);

        annotation { "Name" : "Key Depth" }
        isLength(definition.keyDepth, LENGTH_BOUNDS);

        annotation { "Name" : "Top Radius" }
        isLength(definition.topRadius, LENGTH_BOUNDS);
    }
    {
        // Bottom profile
        var bottomSketch = newSketchOnPlane(context, id + "bottomSketch", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        skRectangle(bottomSketch, "bottom", {
            "firstCorner" : vector(-definition.keyWidth/2, -definition.keyHeight/2),
            "secondCorner" : vector(definition.keyWidth/2, definition.keyHeight/2)
        });

        skSolve(bottomSketch);

        // Top profile (smaller, rounded)
        var topSketch = newSketchOnPlane(context, id + "topSketch", {
            "sketchPlane" : plane(vector(0, 0, definition.keyDepth), vector(0, 0, 1))
        });

        var inset = 0.5 * millimeter;
        skRectangle(topSketch, "top", {
            "firstCorner" : vector(-definition.keyWidth/2 + inset, -definition.keyHeight/2 + inset),
            "secondCorner" : vector(definition.keyWidth/2 - inset, definition.keyHeight/2 - inset)
        });

        skSolve(topSketch);

        // Loft between profiles
        opLoft(context, id + "loft1", {
            "profileSubqueries" : [
                qSketchRegion(id + "bottomSketch"),
                qSketchRegion(id + "topSketch")
            ]
        });

        // Fillet top edges
        opFillet(context, id + "fillet1", {
            "entities" : qClosestTo(
                qCreatedBy(id + "loft1", EntityType.EDGE),
                vector(0, 0, definition.keyDepth)
            ),
            "radius" : definition.topRadius
        });
    });
```

### Speaker Grill Pattern
```featurescript
annotation { "Feature Type Name" : "Speaker Grill" }
export const speakerGrill = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Grill Width" }
        isLength(definition.grillWidth, LENGTH_BOUNDS);

        annotation { "Name" : "Grill Height" }
        isLength(definition.grillHeight, LENGTH_BOUNDS);

        annotation { "Name" : "Hole Diameter" }
        isLength(definition.holeDia, LENGTH_BOUNDS);

        annotation { "Name" : "Hole Spacing" }
        isLength(definition.spacing, LENGTH_BOUNDS);

        annotation { "Name" : "Plate Thickness" }
        isLength(definition.thickness, LENGTH_BOUNDS);
    }
    {
        // Create base plate
        var plateSketch = newSketchOnPlane(context, id + "plateSketch", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        skRectangle(plateSketch, "plate", {
            "firstCorner" : vector(-definition.grillWidth/2, -definition.grillHeight/2),
            "secondCorner" : vector(definition.grillWidth/2, definition.grillHeight/2)
        });

        // Create hole pattern
        var xCount = floor(definition.grillWidth / definition.spacing);
        var yCount = floor(definition.grillHeight / definition.spacing);
        var xStart = -((xCount - 1) * definition.spacing) / 2;
        var yStart = -((yCount - 1) * definition.spacing) / 2;

        var holeIndex = 0;
        for (var i = 0; i < xCount; i += 1)
        {
            for (var j = 0; j < yCount; j += 1)
            {
                skCircle(plateSketch, "hole" ~ holeIndex, {
                    "center" : vector(xStart + i * definition.spacing, yStart + j * definition.spacing),
                    "radius" : definition.holeDia / 2
                });
                holeIndex += 1;
            }
        }

        skSolve(plateSketch);

        // Extrude with holes
        opExtrude(context, id + "extrude1", {
            "entities" : qSketchRegion(id + "plateSketch"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : definition.thickness
        });
    });
```

## Tips for Hardware Modeling

1. **Measure twice**: Get accurate dimensions from reference images using scale references
2. **Start simple**: Create basic shapes first, then add details
3. **Use patterns**: For repetitive features like screw holes, vents, etc.
4. **Consider manufacturing**: Add draft angles for injection molded parts
5. **Tolerance**: Account for fit between mating parts (0.1-0.2mm clearance typical)
