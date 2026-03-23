import type { Point, ScaleCalibration } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

let points: Point[] = [];

export function activateScaleTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  points = [];

  const onClick = (e: MouseEvent) => {
    if (e.ctrlKey) return;
    if (e.button !== 0) return;
    if (photoLayer.isPanningNow) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);
    points.push(imgPt);
    drawingLayer.setActivePoints([...points]);
    renderFn();

    if (points.length === 2) {
      // Prompt for distance
      const distStr = prompt('請輸入兩點之間的實際距離（mm）：');
      if (distStr) {
        const distance_mm = parseFloat(distStr);
        if (distance_mm > 0) {
          const dx = points[1].x - points[0].x;
          const dy = points[1].y - points[0].y;
          const px_dist = Math.sqrt(dx * dx + dy * dy);
          const px_per_mm = px_dist / distance_mm;

          const scale: ScaleCalibration = {
            pointA_px: points[0],
            pointB_px: points[1],
            distance_mm,
            px_per_mm,
          };
          store.setScale(scale);
        }
      }
      points = [];
      drawingLayer.clearActive();
      renderFn();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      points = [];
      drawingLayer.clearActive();
      renderFn();
    }
  };

  drawingCanvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    drawingCanvas.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    points = [];
    drawingLayer.clearActive();
  };
}
