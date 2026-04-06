import { Router } from 'express';
import { callGemini } from '../geminiClient.js';
import { simplifyContour } from '../services/contourSimplify.js';

const router = Router();

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
  let geoInfo = '';
  if (contour && contour.length > 3) {
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

  const prompt = `You are an Onshape FeatureScript expert. Generate production-ready FeatureScript code.

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
    const result = await callGemini({
      prompt,
      callType: 'featurescript',
      projectId: measurementData.projectId,
    });

    let code = result.text;
    const fenceMatch = code.match(/```(?:featurescript|javascript|typescript|fs)?\s*\n([\s\S]*?)```/);
    if (fenceMatch) {
      code = fenceMatch[1].trim();
    }

    res.json({ code, method: 'gemini' });
  } catch (err: any) {
    console.error('FeatureScript generation error (Gemini), using fallback:', err.message);

    // Fallback: generate basic FeatureScript without AI
    try {
      const code = generateFallbackFS(measurementData);
      res.json({ code, method: 'fallback' });
    } catch (fallbackErr: any) {
      res.status(500).json({
        error: fallbackErr.message || 'FeatureScript generation failed',
      });
    }
  }
});

export default router;
