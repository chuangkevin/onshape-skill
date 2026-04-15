import { Router } from 'express';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { fuseMeasurements, detectConflicts } from '../services/fusion.js';
import type { ViewAngle } from '@shared/types.js';

const router = Router();

// POST /api/projects/:id/export
router.post('/:id/export', (req, res) => {
  const db = getDb();
  const project: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Get latest analysis results
  const latestResult: any = db.prepare(
    'SELECT parsed_data, raw_response FROM analysis_results WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.params.id);

  const aiResults = latestResult
    ? {
        ...(JSON.parse(latestResult.parsed_data || '{}')),
        ...(latestResult.raw_response ? (() => {
          try {
            const raw = JSON.parse(latestResult.raw_response);
            return {
              vehicle: raw.vehicle ?? raw.ai?.vehicle,
              vehicle_dimensions: raw.vehicle_dimensions ?? raw.ai?.vehicle_dimensions,
            };
          } catch {
            return {};
          }
        })() : {}),
      }
    : { ocr_readings: [] };

  // Use frontend store data if provided, otherwise fall back to DB
  const clientPhotos = req.body.photos;

  let photoMeasurements;
  if (clientPhotos && Array.isArray(clientPhotos) && clientPhotos.length > 0) {
    // Build from client-provided data
    photoMeasurements = clientPhotos.map((p: any) => ({
      filename: p.filename,
      angle: (p.angle || 'top') as ViewAngle,
      scale_px_per_mm: p.scale?.px_per_mm,
      user_contour_px: p.drawings
        ?.filter((d: any) => d.type === 'polyline' && d.closed)
        ?.flatMap((d: any) => d.points_px || []) || [],
      user_features: p.features?.map((f: any) => ({
        type: f.type,
        center_px: f.shape?.center_px || { x: 0, y: 0 },
        radius_px: f.shape?.radius_px,
        label: f.label,
      })) || [],
      user_dimensions: p.dimensions?.map((d: any) => ({
        location: d.location,
        value_mm: d.value_mm,
      })) || [],
    }));
  } else {
    // Fall back to DB (existing logic)
    const photos: any[] = db.prepare('SELECT * FROM photos WHERE project_id = ?').all(req.params.id);

    photoMeasurements = photos.map((photo: any) => {
      const drawings: any[] = db.prepare(
        'SELECT shape_data FROM drawings WHERE photo_id = ?'
      ).all(photo.id).map((d: any) => {
        try { return JSON.parse(d.shape_data); } catch { return {}; }
      });

      const features: any[] = db.prepare(
        'SELECT * FROM features WHERE photo_id = ?'
      ).all(photo.id).map((f: any) => {
        try {
          const shape = JSON.parse(f.shape_data);
          return {
            type: f.feature_type,
            center_px: shape.center_px || { x: 0, y: 0 },
            radius_px: shape.radius_px,
            label: f.label,
          };
        } catch { return null; }
      }).filter(Boolean);

      const scaleData = photo.scale_data ? JSON.parse(photo.scale_data) : null;

      return {
        filename: photo.filename,
        angle: (photo.angle || 'top') as ViewAngle,
        scale_px_per_mm: scaleData?.px_per_mm,
        user_contour_px: drawings
          .filter((d: any) => d.type === 'polyline' && d.closed)
          .flatMap((d: any) => d.points_px || []),
        user_features: features,
      };
    });
  }

  // Run fusion
  const measurement = fuseMeasurements({
    partName: project.name,
    photos: photoMeasurements,
    aiResults,
  });

  // Detect conflicts
  const conflicts = detectConflicts(measurement);

  const output = {
    ...measurement,
    vehicle: aiResults.vehicle,
    vehicle_dimensions: aiResults.vehicle_dimensions,
    _meta: {
      project_id: project.id,
      photo_count: photoMeasurements.length,
      conflicts,
      exported_at: new Date().toISOString(),
    },
  };

  // If path specified, save to disk
  const { path: savePath } = req.body;
  if (savePath) {
    const fullPath = resolve(savePath, 'measurement.json');
    writeFileSync(fullPath, JSON.stringify(output, null, 2));
    res.json({ saved: true, path: fullPath, measurement: output });
    return;
  }

  res.json(output);
});

export default router;
