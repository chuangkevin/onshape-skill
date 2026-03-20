import type { Point, ArcShape } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

let points: Point[] = [];
let idCounter = 0;

export function activateArcTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  points = [];

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (photoLayer.isPanningNow) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);
    points.push(imgPt);
    drawingLayer.setActivePoints([...points]);
    renderFn();

    if (points.length === 3) {
      const shape: ArcShape = {
        type: 'arc',
        id: `arc_${Date.now()}_${idCounter++}`,
        start: points[0],
        mid: points[1],
        end: points[2],
      };
      store.addDrawing(shape);
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
