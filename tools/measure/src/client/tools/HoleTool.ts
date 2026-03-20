import type { Point, CircleShape, FeatureAnnotation } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

let centerPoint: Point | null = null;
let idCounter = 0;

export function activateHoleTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  centerPoint = null;

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);

    centerPoint = imgPt;
    drawingLayer.setActivePoints([imgPt]);
    renderFn();

    // Prompt for radius
    const photo = store.getActivePhoto();
    const unit = photo?.scale ? 'mm' : 'px';
    const radiusStr = prompt(`Enter hole radius (${unit}):`);

    if (radiusStr) {
      const radius = parseFloat(radiusStr);
      if (radius > 0) {
        // Convert mm to px if scale available
        const radius_px = photo?.scale
          ? radius * photo.scale.px_per_mm
          : radius;

        const shape: CircleShape = {
          type: 'circle',
          id: `hole_${Date.now()}_${idCounter}`,
          center_px: imgPt,
          radius_px,
        };

        const feature: FeatureAnnotation = {
          id: `feat_${Date.now()}_${idCounter++}`,
          type: 'hole',
          label: `Hole (r=${radius}${unit})`,
          shape,
          dimension_mm: photo?.scale ? radius : undefined,
        };

        store.addDrawing(shape);
        store.addFeature(feature);
      }
    }

    centerPoint = null;
    drawingLayer.clearActive();
    renderFn();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      centerPoint = null;
      drawingLayer.clearActive();
      renderFn();
    }
  };

  drawingCanvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    drawingCanvas.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    centerPoint = null;
    drawingLayer.clearActive();
  };
}
