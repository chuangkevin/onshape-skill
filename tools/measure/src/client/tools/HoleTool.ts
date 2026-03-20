import type { Point, CircleShape, FeatureAnnotation } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

let centerPoint: Point | null = null;
let isDragging = false;
let idCounter = 0;

export function activateHoleTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  centerPoint = null;
  isDragging = false;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (photoLayer.isPanningNow) return;

    const rect = drawingCanvas.getBoundingClientRect();
    centerPoint = photoLayer.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    isDragging = true;
    drawingCanvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || !centerPoint) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const current = photoLayer.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    const dx = current.x - centerPoint.x;
    const dy = current.y - centerPoint.y;
    const radius_px = Math.sqrt(dx * dx + dy * dy);

    // Live preview
    const photo = store.getActivePhoto();
    const tempShape: CircleShape = {
      type: 'circle', id: '_preview', center_px: centerPoint, radius_px,
    };
    drawingLayer.render([...photo!.drawings, tempShape],
      photo?.scale ? { px_per_mm: photo.scale.px_per_mm } : undefined);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || !centerPoint) return;
    isDragging = false;

    const rect = drawingCanvas.getBoundingClientRect();
    const endPt = photoLayer.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    const dx = endPt.x - centerPoint.x;
    const dy = endPt.y - centerPoint.y;
    const radius_px = Math.sqrt(dx * dx + dy * dy);

    if (radius_px < 3) {
      // Too small — ignore
      centerPoint = null;
      renderFn();
      return;
    }

    const photo = store.getActivePhoto();
    const radius_mm = photo?.scale ? radius_px / photo.scale.px_per_mm : null;
    const label = radius_mm
      ? `圓孔（r=${radius_mm.toFixed(1)}mm）`
      : `圓孔（r=${radius_px.toFixed(0)}px）`;

    const shape: CircleShape = {
      type: 'circle',
      id: `hole_${Date.now()}_${idCounter}`,
      center_px: centerPoint,
      radius_px,
    };

    const feature: FeatureAnnotation = {
      id: `feat_${Date.now()}_${idCounter++}`,
      type: 'hole',
      label,
      shape,
      dimension_mm: radius_mm ?? undefined,
    };

    store.addDrawing(shape);
    store.addFeature(feature);
    centerPoint = null;
    renderFn();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      centerPoint = null;
      isDragging = false;
      drawingLayer.clearActive();
      renderFn();
    }
  };

  drawingCanvas.addEventListener('pointerdown', onPointerDown);
  drawingCanvas.addEventListener('pointermove', onPointerMove);
  drawingCanvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    drawingCanvas.removeEventListener('pointerdown', onPointerDown);
    drawingCanvas.removeEventListener('pointermove', onPointerMove);
    drawingCanvas.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    centerPoint = null;
    isDragging = false;
  };
}
