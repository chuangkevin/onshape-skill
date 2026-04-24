import { Router } from 'express';
import { callGeminiWithApiKey } from '../geminiClient.js';
import { getGeminiStepRunner } from '../aiCoreGeminiPool.js';
import { simplifyContour } from '../services/contourSimplify.js';

const router = Router();

function sanitizeAsciiName(input: string): string {
  const normalized = input.replace(/[^\x20-\x7E]+/g, ' ').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || 'Vehicle Concept';
}

function isVehicleAnalysisData(data: any): boolean {
  const sizeClass = String(data?.object?.estimated_size_class || '').toLowerCase();
  return Boolean(
    data?.vehicle
    || data?.vehicle_dimensions
    || data?.object?.object_type === 'car'
    || sizeClass.includes('vehicle')
  );
}

function findFeatureValue(features: any[], patterns: RegExp[]): number | undefined {
  for (const feature of features || []) {
    const name = String(feature?.feature_name || '').toLowerCase();
    if (feature?.value_mm == null) continue;
    if (patterns.some(pattern => pattern.test(name))) {
      return Number(feature.value_mm);
    }
  }
  return undefined;
}

function extractVehicleParams(data: any): {
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wheelbaseMm: number;
  wheelDiameterMm: number;
} {
  const features = Array.isArray(data?.features) ? data.features : [];
  const dims = data?.vehicle_dimensions || {};
  const vehicle = data?.vehicle || {};
  const rawName = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.variant,
  ].filter(Boolean).join(' ') || data?.object?.common_name || 'Vehicle Concept';
  const name = sanitizeAsciiName(rawName);

  const lengthMm = Number(dims.length_mm || findFeatureValue(features, [/overall length/, /vehicle length/, /car length/]) || 4500);
  const widthMm = Number(dims.width_mm || findFeatureValue(features, [/overall width/, /vehicle width/, /car width/]) || 1800);
  const heightMm = Number(dims.height_mm || findFeatureValue(features, [/overall height/, /vehicle height/, /car height/]) || 1500);
  const wheelbaseMm = Number(dims.wheelbase_mm || findFeatureValue(features, [/wheelbase/]) || lengthMm * 0.58);
  const wheelDiameterMm = Number(findFeatureValue(features, [/wheel diameter/, /tire diameter/]) || 700);

  return { name, lengthMm, widthMm, heightMm, wheelbaseMm, wheelDiameterMm };
}

function generateVehicleFallbackFS(data: any): string {
  const params = extractVehicleParams(data);
  const bodyHeightRatio = 0.58;
  const cabinLengthRatio = 0.52;
  const cabinWidthRatio = 0.82;
  const roofFrontOffsetRatio = 0.08;
  const wheelInsetRatio = 0.38;

  return `FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "${params.name}" }
export const vehicleConcept = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "車長 (Length)" }
        isLength(definition.length, { (millimeter) : [1000, ${params.lengthMm}, 10000] } as LengthBoundSpec);

        annotation { "Name" : "車寬 (Width)" }
        isLength(definition.width, { (millimeter) : [800, ${params.widthMm}, 4000] } as LengthBoundSpec);

        annotation { "Name" : "車高 (Height)" }
        isLength(definition.height, { (millimeter) : [800, ${params.heightMm}, 4000] } as LengthBoundSpec);

        annotation { "Name" : "軸距 (Wheelbase)" }
        isLength(definition.wheelbase, { (millimeter) : [1000, ${params.wheelbaseMm}, 7000] } as LengthBoundSpec);

        annotation { "Name" : "輪徑 (Wheel Diameter)" }
        isLength(definition.wheelDiameter, { (millimeter) : [300, ${params.wheelDiameterMm}, 1500] } as LengthBoundSpec);
    }
    {
        // ── Body lower section (chassis + engine compartment + passenger area) ──
        var bodySketch = newSketchOnPlane(context, id + "bodySketch", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        // Main body outline with subtle hood curve
        var bodyLength = definition.length;
        var bodyWidth = definition.width;
        var frontCurveDepth = bodyLength * 0.05;

        skPolyline(bodySketch, "bodyOutline", {
            "points" : [
                vector(-bodyLength / 2, -bodyWidth / 2),
                vector(-bodyLength / 2 + frontCurveDepth, -bodyWidth / 2),
                vector(-bodyLength / 2 + frontCurveDepth * 2.2, 0 * millimeter),
                vector(-bodyLength / 2 + frontCurveDepth, bodyWidth / 2),
                vector(-bodyLength / 2, bodyWidth / 2),
                vector(bodyLength / 2, bodyWidth / 2),
                vector(bodyLength / 2, -bodyWidth / 2),
                vector(-bodyLength / 2, -bodyWidth / 2)
            ]
        });
        skSolve(bodySketch);

        opExtrude(context, id + "bodyExtrude", {
            "entities" : qSketchRegion(id + "bodySketch"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : definition.height * ${bodyHeightRatio}
        });

        // ── Cabin / Roof section ──
        var cabinHeight = definition.height * ${bodyHeightRatio};
        var roofSketch = newSketchOnPlane(context, id + "roofSketch", {
            "sketchPlane" : plane(vector(0, 0, 1) * cabinHeight, vector(0, 0, 1))
        });

        var roofLength = bodyLength * ${cabinLengthRatio};
        var roofWidth = bodyWidth * ${cabinWidthRatio};
        var roofOffset = bodyLength * ${roofFrontOffsetRatio};

        skRectangle(roofSketch, "roof", {
            "firstCorner" : vector(-roofLength / 2 + roofOffset, -roofWidth / 2),
            "secondCorner" : vector(roofLength / 2 + roofOffset, roofWidth / 2)
        });
        skSolve(roofSketch);

        opExtrude(context, id + "roofExtrude", {
            "entities" : qSketchRegion(id + "roofSketch"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : definition.height * ${1 - bodyHeightRatio}
        });

        // ── Windows (side + windshield cutouts) ──
        var windowHeight = cabinHeight + (definition.height * 0.05);
        var windowSketch = newSketchOnPlane(context, id + "windowSketch", {
            "sketchPlane" : plane(vector(0, bodyWidth / 2, 0) * meter, vector(0, 1, 0), vector(1, 0, 0))
        });

        // Windshield
        skRectangle(windowSketch, "windshield", {
            "firstCorner" : vector(-roofLength / 2 + roofOffset - bodyLength * 0.03, windowHeight),
            "secondCorner" : vector(-roofLength / 2 + roofOffset + bodyLength * 0.12, definition.height * 0.92)
        });

        // Side window
        skRectangle(windowSketch, "sideWindow", {
            "firstCorner" : vector(-roofLength / 2 + roofOffset + bodyLength * 0.15, windowHeight),
            "secondCorner" : vector(roofLength / 2 + roofOffset - bodyLength * 0.08, definition.height * 0.92)
        });
        skSolve(windowSketch);

        try {
            opExtrude(context, id + "windowCutRight", {
                "entities" : qSketchRegion(id + "windowSketch"),
                "direction" : vector(0, -1, 0),
                "endBound" : BoundingType.BLIND,
                "endDepth" : bodyWidth * 0.04,
                "operationType" : NewBodyOperationType.REMOVE
            });
        }

        // Mirror window cut to left side
        var windowSketchLeft = newSketchOnPlane(context, id + "windowSketchLeft", {
            "sketchPlane" : plane(vector(0, -bodyWidth / 2, 0) * meter, vector(0, -1, 0), vector(1, 0, 0))
        });

        skRectangle(windowSketchLeft, "windshieldL", {
            "firstCorner" : vector(-roofLength / 2 + roofOffset - bodyLength * 0.03, windowHeight),
            "secondCorner" : vector(-roofLength / 2 + roofOffset + bodyLength * 0.12, definition.height * 0.92)
        });

        skRectangle(windowSketchLeft, "sideWindowL", {
            "firstCorner" : vector(-roofLength / 2 + roofOffset + bodyLength * 0.15, windowHeight),
            "secondCorner" : vector(roofLength / 2 + roofOffset - bodyLength * 0.08, definition.height * 0.92)
        });
        skSolve(windowSketchLeft);

        try {
            opExtrude(context, id + "windowCutLeft", {
                "entities" : qSketchRegion(id + "windowSketchLeft"),
                "direction" : vector(0, 1, 0),
                "endBound" : BoundingType.BLIND,
                "endDepth" : bodyWidth * 0.04,
                "operationType" : NewBodyOperationType.REMOVE
            });
        }

        // ── Headlights (front) ──
        var headlightZ = definition.height * 0.42;
        var headlightY = bodyWidth * 0.35;
        var headlightX = -bodyLength / 2 + bodyLength * 0.06;
        var headlightRadius = bodyWidth * 0.06;

        try {
            opCylinder(context, id + "headlightLeft", {
                "bottomCenter" : vector(headlightX, headlightY, headlightZ),
                "radius" : headlightRadius,
                "height" : bodyLength * 0.02,
                "direction" : vector(-1, 0, 0)
            });

            opCylinder(context, id + "headlightRight", {
                "bottomCenter" : vector(headlightX, -headlightY, headlightZ),
                "radius" : headlightRadius,
                "height" : bodyLength * 0.02,
                "direction" : vector(-1, 0, 0)
            });
        }

        // ── Taillights (rear) ──
        var taillightX = bodyLength / 2 - bodyLength * 0.04;
        var taillightZ = definition.height * 0.38;

        try {
            opCylinder(context, id + "taillightLeft", {
                "bottomCenter" : vector(taillightX, headlightY, taillightZ),
                "radius" : headlightRadius * 0.7,
                "height" : bodyLength * 0.015,
                "direction" : vector(1, 0, 0)
            });

            opCylinder(context, id + "taillightRight", {
                "bottomCenter" : vector(taillightX, -headlightY, taillightZ),
                "radius" : headlightRadius * 0.7,
                "height" : bodyLength * 0.015,
                "direction" : vector(1, 0, 0)
            });
        }

        // ── Wheels (reference cylinders) ──
        var axleOffset = definition.wheelbase / 2;
        var wheelInset = bodyWidth * ${wheelInsetRatio};
        var wheelRadius = definition.wheelDiameter / 2;
        var wheelThickness = bodyWidth * 0.12;

        try {
            opCylinder(context, id + "wheelFrontLeft", {
                "bottomCenter" : vector(-axleOffset, wheelInset, wheelRadius),
                "radius" : wheelRadius,
                "height" : wheelThickness,
                "direction" : vector(0, -1, 0)
            });

            opCylinder(context, id + "wheelFrontRight", {
                "bottomCenter" : vector(-axleOffset, -wheelInset, wheelRadius),
                "radius" : wheelRadius,
                "height" : wheelThickness,
                "direction" : vector(0, 1, 0)
            });

            opCylinder(context, id + "wheelRearLeft", {
                "bottomCenter" : vector(axleOffset, wheelInset, wheelRadius),
                "radius" : wheelRadius,
                "height" : wheelThickness,
                "direction" : vector(0, -1, 0)
            });

            opCylinder(context, id + "wheelRearRight", {
                "bottomCenter" : vector(axleOffset, -wheelInset, wheelRadius),
                "radius" : wheelRadius,
                "height" : wheelThickness,
                "direction" : vector(0, 1, 0)
            });
        }
    });`;
}

function buildVehiclePrompt(data: any): string {
  const params = extractVehicleParams(data);
  return `You are an Onshape FeatureScript expert. Generate a simplified but usable parametric car concept model.

The source came from vehicle video analysis, not contour tracing.
Model a clean exterior concept body using official dimensions and visible cues.

Requirements:
1. Output complete FeatureScript only.
2. Start with FeatureScript 2909 and common.fs import.
3. Use ASCII-only Feature Type Name.
4. Use parameters for length, width, height, wheelbase, and wheel diameter.
5. Create a simplified vehicle body as 2 or more solids/sketches, not just one plain block.
6. Add wheel position guide geometry or wheel placeholders using the wheelbase.
7. Keep the model centered at the origin.
8. Prefer robust primitives (rectangle, circle, extrude) over fragile operations.
9. Add short comments explaining body, roof/cabin, and wheel placement.

Preferred vehicle dimensions:
- length: ${params.lengthMm} mm
- width: ${params.widthMm} mm
- height: ${params.heightMm} mm
- wheelbase: ${params.wheelbaseMm} mm
- wheel diameter: ${params.wheelDiameterMm} mm

Vehicle analysis result:
${JSON.stringify(data, null, 2)}`;
}

function normalizeFeatureScriptCode(code: string): string {
  const fenceMatch = code.match(/```(?:featurescript|javascript|typescript|fs|onshapeFeatureScript)?\s*\n([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : code.trim();
}

function isValidFeatureScriptCode(code: string): boolean {
  const normalized = normalizeFeatureScriptCode(code);
  return /^\uFEFF?FeatureScript 2909;/.test(normalized)
    && /import\s*\(\s*path\s*:\s*"onshape\/std\/common\.fs"\s*,\s*version\s*:\s*"2909\.0"\s*\);/.test(normalized)
    && /annotation\s*\{\s*"Feature Type Name"/.test(normalized)
    && /export\s+const\s+/.test(normalized)
    && /defineFeature\s*\(\s*function\s*\(\s*context\s+is\s+Context\s*,\s*id\s+is\s+Id/.test(normalized)
    && !normalized.includes('include "common.fs"');
}

// ── Reference FeatureScript (L390 Battery) for few-shot prompting ────────────
const REFERENCE_FS = `FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "Lenovo L390 Battery" }
export const l390Battery = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Thickness" }
        isLength(definition.thickness, { (millimeter) : [1, 6.7, 20] } as LengthBoundSpec);
    }
    {
        var length = 291.3 * millimeter;
        var maxHeight = 81.5 * millimeter;
        var mainHeight = 73.0 * millimeter;
        var thickness = definition.thickness;

        var sketch1 = newSketchOnPlane(context, id + "sketch1", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        var bottomY = -maxHeight/2;
        var mainTopY = bottomY + mainHeight;
        var raisedTopY = maxHeight/2;

        skRectangle(sketch1, "mainBody", {
            "firstCorner" : vector(-length/2, bottomY),
            "secondCorner" : vector(length/2, mainTopY)
        });

        skRectangle(sketch1, "raisedSection", {
            "firstCorner" : vector(-10.65 * millimeter, mainTopY - 1 * millimeter),
            "secondCorner" : vector(43.35 * millimeter, raisedTopY)
        });

        const addTab = function(sketch, tabId, xCenter, yBase, yTip, isTop) {
            var tabWidth = 12 * millimeter;
            var holeRadius = 1.25 * millimeter;
            var yDir = isTop ? 1 : -1;
            skRectangle(sketch, tabId ~ "_rect", {
                "firstCorner" : vector(xCenter - tabWidth/2, yBase - 2 * millimeter * yDir),
                "secondCorner" : vector(xCenter + tabWidth/2, yTip)
            });
            skCircle(sketch, tabId ~ "_hole", {
                "center" : vector(xCenter, yTip - 3 * millimeter * yDir),
                "radius" : holeRadius
            });
        };

        addTab(sketch1, "topTab1", -60.65 * millimeter, mainTopY, raisedTopY, true);
        addTab(sketch1, "topTab2", 49.35 * millimeter, mainTopY, raisedTopY, true);
        addTab(sketch1, "topTab3", 139.35 * millimeter, mainTopY, raisedTopY, true);

        addTab(sketch1, "botTab1", 14.35 * millimeter, bottomY, bottomY - 8 * millimeter, false);
        addTab(sketch1, "botTab2", 89.35 * millimeter, bottomY, bottomY - 8 * millimeter, false);

        skSolve(sketch1);

        opExtrude(context, id + "extrude1", {
            "entities" : qSketchRegion(id + "sketch1"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : thickness
        });
    });`;

// ── Fallback: generate basic FeatureScript without AI ────────────────────────
function generateFallbackFS(data: any): string {
  const contour = data.contour_mm || data.photos?.[0]?.contour_mm || [];
  const thickness = data.thickness_mm || 5;
  const name = data.model_number || 'MeasuredPart';

  if (contour.length < 3) {
    return `// Error: not enough contour points (${contour.length}) to generate FeatureScript`;
  }

  // Simplify if too many points
  const geo = simplifyContour(contour);
  const pts = geo.simplified_points_mm;

  // Center the contour
  const cx = geo.boundingBox.x + geo.boundingBox.width / 2;
  const cy = geo.boundingBox.y + geo.boundingBox.height / 2;

  const splinePoints = pts.map(p =>
    `            vector(${(p.x - cx).toFixed(2)} * millimeter, ${(p.y - cy).toFixed(2)} * millimeter)`
  ).join(',\n');

  return `FeatureScript 2909;
import(path : "onshape/std/common.fs", version : "2909.0");

annotation { "Feature Type Name" : "${name}" }
export const measuredPart = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Thickness" }
        isLength(definition.thickness, { (millimeter) : [1, ${thickness}, 50] } as LengthBoundSpec);
    }
    {
        // Generated from photo measurement (${pts.length} spline control points)
        // Bounding box: ${geo.boundingBox.width.toFixed(1)} x ${geo.boundingBox.height.toFixed(1)} mm
        var thickness = definition.thickness;

        var sketch1 = newSketchOnPlane(context, id + "sketch1", {
            "sketchPlane" : plane(vector(0, 0, 0) * meter, vector(0, 0, 1))
        });

        // Main contour — smooth fitted spline through measured points
        skFitSpline(sketch1, "contour", {
            "points" : [
${splinePoints}
            ],
            "closed" : true
        });
${geo.holes.map((h, i) => `
        skCircle(sketch1, "hole${i}", {
            "center" : vector(${(h.center_mm.x - cx).toFixed(2)} * millimeter, ${(h.center_mm.y - cy).toFixed(2)} * millimeter),
            "radius" : ${h.radius_mm.toFixed(2)} * millimeter
        });`).join('')}

        skSolve(sketch1);

        opExtrude(context, id + "extrude1", {
            "entities" : qSketchRegion(id + "sketch1"),
            "direction" : vector(0, 0, 1),
            "endBound" : BoundingType.BLIND,
            "endDepth" : thickness
        });
    });`;
}

// ── POST /api/generate-featurescript ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const measurementData = req.body;

  if (!measurementData || Object.keys(measurementData).length === 0) {
    res.status(400).json({ error: 'Measurement data is required' });
    return;
  }

  // Pre-process: simplify contour if present
  const contour = measurementData.contour_mm || measurementData.photos?.[0]?.contour_mm;
  const isVehicle = isVehicleAnalysisData(measurementData);
  let geoInfo = '';
  if (!isVehicle && contour && contour.length > 3) {
    const geo = simplifyContour(contour);
    geoInfo = `
Simplified geometry analysis:
- Bounding box: ${geo.boundingBox.width.toFixed(1)} x ${geo.boundingBox.height.toFixed(1)} mm
- ${geo.tabs.length} mounting tabs detected: ${geo.tabs.map(t => `${t.edge} (${t.width_mm}x${t.depth_mm}mm)`).join(', ') || 'none'}
- ${geo.holes.length} holes
- Simplified contour: ${geo.simplified_points_mm.length} points (from ${contour.length})

Use skRectangle for the main body and each tab. Use skCircle for holes.
For truly irregular shapes use skFitSpline (closed:true) — NOT skPolyline.`;
  }

  const prompt = isVehicle
    ? buildVehiclePrompt(measurementData)
    : `You are an Onshape FeatureScript expert. Generate production-ready FeatureScript code.

REFERENCE EXAMPLE (a laptop battery):
\`\`\`
${REFERENCE_FS}
\`\`\`

KEY RULES:
1. Start with: FeatureScript 2909; import(path : "onshape/std/common.fs", version : "2909.0");
2. Center geometry at origin (0,0). Use "* millimeter" for all dimensions.
3. Use precondition with isLength() for thickness parameter with LengthBoundSpec.
4. Prefer skRectangle for rectangular body + tabs. Use skFitSpline (with "closed":true) for truly irregular shapes — NEVER skPolyline (produces jagged edges).
5. Add skCircle for each hole (M2 hole = 1.25mm radius).
6. Use opExtrude with BoundingType.BLIND for 3D.
7. Use helper functions (like addTab) for repeated features.
8. Add clear comments explaining each section.
${geoInfo}

MEASUREMENT DATA:
${JSON.stringify(measurementData, null, 2)}

Generate the complete FeatureScript code. Output ONLY code, no explanation.`;

  try {
    const runner = getGeminiStepRunner();
    const result = await runner.runStep({
      id: 'generate-featurescript',
      name: 'generate-featurescript',
      allowSharedFallback: true,
      run: (apiKey) => callGeminiWithApiKey({
        apiKey,
        prompt,
        callType: 'featurescript',
        projectId: measurementData.projectId,
      }),
    });
    console.warn(`[featurescript step] generate-featurescript -> ...${result.metadata.keyUsed.slice(-4)}${result.metadata.sharedFallbackUsed ? ' (shared)' : ''}`);

    const code = normalizeFeatureScriptCode(result.value.text);
    if (!isValidFeatureScriptCode(code)) {
      throw new Error('Gemini returned invalid FeatureScript format');
    }

    res.json({ code, method: 'gemini' });
  } catch (err: any) {
    console.error('FeatureScript generation error (Gemini), using fallback:', err.message);

    // Fallback: generate basic FeatureScript without AI
    try {
      const code = isVehicle ? generateVehicleFallbackFS(measurementData) : generateFallbackFS(measurementData);
      res.json({ code, method: 'fallback' });
    } catch (fallbackErr: any) {
      res.status(500).json({
        error: fallbackErr.message || 'FeatureScript generation failed',
      });
    }
  }
});

export default router;
