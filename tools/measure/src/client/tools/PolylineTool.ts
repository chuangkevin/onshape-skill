import type { Point, PolylineShape } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

let points: Point[] = [];
let idCounter = 0;

export function activatePolylineTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  points = [];

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);
    points.push(imgPt);
    drawingLayer.setActivePoints([...points]);
    renderFn();
  };

  const onDblClick = (_e: MouseEvent) => {
    if (points.length >= 2) {
      const shape: PolylineShape = {
        type: 'polyline',
        id: `poly_${Date.now()}_${idCounter++}`,
        points_px: [...points],
        closed: true,
      };
      store.addDrawing(shape);
    }
    points = [];
    drawingLayer.clearActive();
    renderFn();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && points.length >= 2) {
      const shape: PolylineShape = {
        type: 'polyline',
        id: `poly_${Date.now()}_${idCounter++}`,
        points_px: [...points],
        closed: true,
      };
      store.addDrawing(shape);
      points = [];
      drawingLayer.clearActive();
      renderFn();
    } else if (e.key === 'Escape') {
      points = [];
      drawingLayer.clearActive();
      renderFn();
    }
  };

  drawingCanvas.addEventListener('click', onClick);
  drawingCanvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);

  // Return cleanup function
  return () => {
    drawingCanvas.removeEventListener('click', onClick);
    drawingCanvas.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKeyDown);
    points = [];
    drawingLayer.clearActive();
  };
}
