import { describe, it, expect, beforeEach } from 'vitest';
import { checkPython, detectEdges, deriveROI, resetPythonCheck } from '../../src/server/services/opencv.js';

beforeEach(() => {
  resetPythonCheck();
});

describe('OpenCV', () => {
  it('checkPython returns a boolean', async () => {
    const available = await checkPython();
    expect(typeof available).toBe('boolean');
  });

  it('detectEdges returns proper structure for non-existent image', async () => {
    const result = await detectEdges('/nonexistent/image.jpg');
    expect(result).toHaveProperty('contours');
    expect(result).toHaveProperty('circles');
    expect(Array.isArray(result.contours)).toBe(true);
    expect(Array.isArray(result.circles)).toBe(true);
    // Should have error (either Python unavailable or image not found)
    expect(result.error).toBeTruthy();
  });

  it('detectEdges result has proper types', async () => {
    const result = await detectEdges('/nonexistent/image.jpg');
    expect(result.contours).toEqual([]);
    expect(result.circles).toEqual([]);
  });
});

describe('deriveROI', () => {
  it('calculates bounding box with 10% padding', () => {
    const drawings = [
      { points_px: [{ x: 100, y: 50 }, { x: 500, y: 400 }] },
    ];
    const roi = deriveROI(drawings, 1000, 800);
    expect(roi).toBeTruthy();
    expect(roi!.x).toBe(60);   // 100 - 40
    expect(roi!.y).toBe(15);   // 50 - 35
    expect(roi!.width).toBe(480); // 400 + 80
    expect(roi!.height).toBe(420); // 350 + 70
  });

  it('clamps to image bounds', () => {
    const drawings = [
      { points_px: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
    ];
    const roi = deriveROI(drawings, 200, 200);
    expect(roi).toBeTruthy();
    expect(roi!.x).toBe(0);
    expect(roi!.y).toBe(0);
  });

  it('returns undefined for empty drawings', () => {
    const roi = deriveROI([], 1000, 800);
    expect(roi).toBeUndefined();
  });

  it('handles multiple drawings', () => {
    const drawings = [
      { points_px: [{ x: 50, y: 50 }] },
      { points_px: [{ x: 300, y: 200 }] },
    ];
    const roi = deriveROI(drawings, 1000, 800);
    expect(roi).toBeTruthy();
    // Bounding: 50-300 x 50-200, size 250x150, pad 25x15
    expect(roi!.x).toBe(25);
    expect(roi!.y).toBe(35);
  });
});
