import type { Point, PolylineShape } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

// Exposed so main.ts can check if user is mid-drawing
export let isDrawingInProgress = false;

let points: Point[] = [];
let idCounter = 0;
let lastClickTime = 0;

export function activatePolylineTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  points = [];
  lastClickTime = 0;

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (photoLayer.isPanningNow) return;

    // Debounce: ignore clicks within 300ms (part of dblclick)
    const now = Date.now();
    if (now - lastClickTime < 300) return;
    lastClickTime = now;

    setTimeout(() => {
      const rect = drawingCanvas.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);
      points.push(imgPt);
      isDrawingInProgress = points.length > 0;
      drawingLayer.setActivePoints([...points]);
      renderFn();
    }, 50);
  };

  const onDblClick = (e: MouseEvent) => {
    e.preventDefault();
    // Don't add the double-click point
    lastClickTime = Date.now(); // prevent the pending setTimeout click
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

  return () => {
    drawingCanvas.removeEventListener('click', onClick);
    drawingCanvas.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKeyDown);
    points = [];
    isDrawingInProgress = false;
    drawingLayer.clearActive();
  };
}
