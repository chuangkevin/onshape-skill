import { describe, it, expect } from 'vitest';
import { fuseMeasurements, detectConflicts } from '../../src/server/services/fusion.js';

describe('fuseMeasurements', () => {
  it('creates basic measurement from user drawing', () => {
    const result = fuseMeasurements({
      partName: 'Test Part',
      photos: [{
        filename: 'test.jpg',
        angle: 'top',
        scale_px_per_mm: 3.42,
        user_contour_px: [
          { x: 0, y: 0 },
          { x: 342, y: 0 },
          { x: 342, y: 171 },
          { x: 0, y: 171 },
        ],
      }],
      aiResults: {
        ocr_readings: [],
      },
    });

    expect(result.part_name).toBe('Test Part');
    expect(result.views).toHaveLength(1);
    expect(result.views[0].contour_mm).toHaveLength(4);
    expect(result.views[0].source).toBe('user_drawing');
    // 342px / 3.42 = 100mm
    expect(result.views[0].contour_mm[1].x).toBeCloseTo(100, 0);
  });

  it('prioritizes OpenCV contour over user drawing', () => {
    const result = fuseMeasurements({
      partName: 'Test Part',
      photos: [{
        filename: 'test.jpg',
        angle: 'top',
        scale_px_per_mm: 2.0,
        user_contour_px: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        opencv_result: {
          contours: [{
            contour_px: [
              { x: 0, y: 0 }, { x: 200, y: 0 },
              { x: 200, y: 150 }, { x: 0, y: 150 },
            ],
            area_px: 30000,
            bounding_box: { x: 0, y: 0, width: 200, height: 150 },
          }],
          circles: [],
        },
      }],
      aiResults: { ocr_readings: [] },
    });

    expect(result.views[0].source).toBe('opencv');
    expect(result.views[0].contour_mm).toHaveLength(4);
    // 200px / 2 = 100mm
    expect(result.views[0].contour_mm[1].x).toBeCloseTo(100, 0);
  });

  it('includes official specs in output', () => {
    const result = fuseMeasurements({
      partName: 'Battery',
      photos: [],
      aiResults: {
        ocr_readings: [],
        official_specs: { length: 291, width: 81.5 },
        label_info: { model_number: 'L17C3P53', specs_text: [] },
      },
    });

    expect(result.model_number).toBe('L17C3P53');
    expect(result.official_specs.length).toBe(291);
    expect(result.official_specs.width).toBe(81.5);
  });

  it('fuses caliper readings from OCR and user input', () => {
    const result = fuseMeasurements({
      partName: 'Part',
      photos: [{
        filename: 'test.jpg',
        angle: 'side',
        user_dimensions: [
          { location: 'thickness', value_mm: 6.7 },
        ],
      }],
      aiResults: {
        ocr_readings: [
          { value: 6.8, unit: 'mm', location: 'thickness', confidence: 'medium' },
          { value: 27.8, unit: 'mm', location: 'connector width', confidence: 'medium' },
        ],
      },
    });

    // User input overrides OCR for 'thickness'
    const thickness = result.caliper_readings.find((r) => r.location === 'thickness');
    expect(thickness).toBeTruthy();
    expect(thickness!.value_mm).toBe(6.7);
    expect(thickness!.source).toBe('user_drawing');

    // 'connector width' only from OCR
    const connector = result.caliper_readings.find((r) => r.location === 'connector width');
    expect(connector).toBeTruthy();
    expect(connector!.value_mm).toBe(27.8);
    expect(connector!.source).toBe('gemini_vision');
  });

  it('converts units for caliper readings', () => {
    const result = fuseMeasurements({
      partName: 'Part',
      photos: [],
      aiResults: {
        ocr_readings: [
          { value: 2.5, unit: 'cm', location: 'width', confidence: 'medium' },
          { value: 1.0, unit: 'inch', location: 'depth', confidence: 'medium' },
        ],
      },
    });

    expect(result.caliper_readings[0].value_mm).toBe(25); // 2.5cm = 25mm
    expect(result.caliper_readings[1].value_mm).toBeCloseTo(25.4, 1); // 1 inch = 25.4mm
  });

  it('assigns confidence levels', () => {
    // High confidence: official specs + OpenCV + scale + readings + user contour
    const highResult = fuseMeasurements({
      partName: 'Part',
      photos: [{
        filename: 'test.jpg',
        angle: 'top',
        scale_px_per_mm: 3.0,
        user_contour_px: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
        opencv_result: {
          contours: [{
            contour_px: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
            area_px: 60000,
            bounding_box: { x: 0, y: 0, width: 300, height: 200 },
          }],
          circles: [],
        },
      }],
      aiResults: {
        ocr_readings: [{ value: 10, unit: 'mm', location: 'x', confidence: 'medium' }],
        official_specs: { length: 100 },
      },
    });
    // With all sources present, confidence should be at least medium
    expect(['high', 'medium']).toContain(highResult.confidence.overall);

    // Low confidence: nothing
    const lowResult = fuseMeasurements({
      partName: 'Part',
      photos: [{ filename: 'test.jpg', angle: 'top' }],
      aiResults: { ocr_readings: [] },
    });
    expect(lowResult.confidence.overall).toBe('low');
  });
});

describe('detectConflicts', () => {
  it('detects conflict when measured differs from official by >5%', () => {
    const measurement = fuseMeasurements({
      partName: 'Part',
      photos: [{
        filename: 'test.jpg',
        angle: 'top',
        scale_px_per_mm: 1.0,
        user_contour_px: [
          { x: 0, y: 0 }, { x: 250, y: 0 },
          { x: 250, y: 80 }, { x: 0, y: 80 },
        ],
      }],
      aiResults: {
        ocr_readings: [],
        official_specs: { length: 291 }, // 250 vs 291 = ~14% diff
      },
    });

    const conflicts = detectConflicts(measurement);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].diff_percent).toBeGreaterThan(5);
  });

  it('returns no conflicts when measurements match', () => {
    const measurement = fuseMeasurements({
      partName: 'Part',
      photos: [{
        filename: 'test.jpg',
        angle: 'top',
        scale_px_per_mm: 1.0,
        user_contour_px: [
          { x: 0, y: 0 }, { x: 291, y: 0 },
          { x: 291, y: 81 }, { x: 0, y: 81 },
        ],
      }],
      aiResults: {
        ocr_readings: [],
        official_specs: { length: 291, width: 81 },
      },
    });

    const conflicts = detectConflicts(measurement);
    expect(conflicts).toHaveLength(0);
  });
});
