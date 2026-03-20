import type { DrawingShape, Point } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import { store } from '../state/store.js';

let selectedId: string | null = null;

export function activateSelectTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  renderFn: () => void,
): () => void {
  selectedId = null;

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);

    const photo = store.getActivePhoto();
    if (!photo) return;

    // Find nearest shape
    selectedId = findNearestShape(imgPt, photo.drawings);
    renderFn();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      store.removeDrawing(selectedId);
      // Also remove feature if linked
      const photo = store.getActivePhoto();
      if (photo) {
        const feat = photo.features.find((f) => f.shape.id === selectedId);
        if (feat) store.removeFeature(feat.id);
      }
      selectedId = null;
      renderFn();
    }
  };

  drawingCanvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    drawingCanvas.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    selectedId = null;
  };
}

function findNearestShape(pt: Point, shapes: DrawingShape[]): string | null {
  let best: string | null = null;
  let bestDist = 20; // Max selection distance in px

  for (const shape of shapes) {
    let dist = Infinity;
    if (shape.type === 'polyline') {
      for (const v of shape.points_px) {
        const d = Math.sqrt((pt.x - v.x) ** 2 + (pt.y - v.y) ** 2);
        dist = Math.min(dist, d);
      }
    } else if (shape.type === 'circle') {
      dist = Math.abs(
        Math.sqrt((pt.x - shape.center_px.x) ** 2 + (pt.y - shape.center_px.y) ** 2) - shape.radius_px
      );
    } else if (shape.type === 'arc') {
      for (const v of [shape.start, shape.mid, shape.end]) {
        const d = Math.sqrt((pt.x - v.x) ** 2 + (pt.y - v.y) ** 2);
        dist = Math.min(dist, d);
      }
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = shape.id;
    }
  }
  return best;
}

export function getSelectedId(): string | null {
  return selectedId;
}
