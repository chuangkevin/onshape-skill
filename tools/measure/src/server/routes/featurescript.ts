import { Router } from 'express';
import { callGemini } from '../geminiClient.js';

const router = Router();

// POST /api/generate-featurescript
router.post('/', async (req, res) => {
  const measurementData = req.body;

  if (!measurementData || Object.keys(measurementData).length === 0) {
    res.status(400).json({ error: 'Measurement data is required' });
    return;
  }

  const prompt = `You are an Onshape FeatureScript expert. Generate FeatureScript code based on the following measurement data.

Rules:
- Use FeatureScript standard library
- All dimensions in millimeters
- Use skPolyline for complex contour shapes from contour_mm points
- Use opExtrude to create 3D geometry from 2D sketches
- Use fCuboid for simple rectangular shapes
- Use fCylinder for cylindrical features
- Add holes using skCircle for each feature with type "hole"
- Include proper annotations and comments
- Use millimeter as the unit throughout

Measurement data:
${JSON.stringify(measurementData, null, 2)}

Generate complete, ready-to-paste FeatureScript code.`;

  try {
    const result = await callGemini({
      prompt,
      callType: 'featurescript',
    });

    // Extract code from the response (strip markdown fences if present)
    let code = result.text;
    const fenceMatch = code.match(/```(?:featurescript|javascript|typescript)?\s*\n([\s\S]*?)```/);
    if (fenceMatch) {
      code = fenceMatch[1].trim();
    }

    res.json({ code });
  } catch (err: any) {
    console.error('FeatureScript generation error:', err);
    res.status(500).json({
      error: err.message || 'FeatureScript generation failed',
    });
  }
});

export default router;
