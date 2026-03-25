import type { Point, PolylineShape } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import type { DrawingLayer } from '../canvas/DrawingLayer.js';
import { store } from '../state/store.js';

/**
 * ROI 選取工具 — 使用者拖曳矩形框選 AI 分析的有效範圍
 * 按住拖曳 → 矩形預覽 → 放開 → 儲存為 4 點 polyline (id 前綴 roi_)
 * 同一時間只保留一個 ROI
 */

let startPt: Point | null = null;

export function activateRoiTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  drawingLayer: DrawingLayer,
  renderFn: () => void,
): () => void {
  startPt = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (photoLayer.isPanningNow) return;

    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    startPt = photoLayer.screenToImage(screenPt.x, screenPt.y);
    drawingCanvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!startPt) return;

    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const endPt = photoLayer.screenToImage(screenPt.x, screenPt.y);

    // 即時預覽矩形（4 點）
    const pts = rectPoints(startPt, endPt);
    drawingLayer.setActivePoints(pts);
    renderFn();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!startPt) return;

    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const endPt = photoLayer.screenToImage(screenPt.x, screenPt.y);

    const w = Math.abs(endPt.x - startPt.x);
    const h = Math.abs(endPt.y - startPt.y);

    if (w > 10 && h > 10) {
      // 移除舊的 ROI
      removeExistingRoi();

      const shape: PolylineShape = {
        type: 'polyline',
        id: `roi_${Date.now()}`,
        points_px: rectPoints(startPt, endPt),
        closed: true,
      };
      store.addDrawing(shape);
    }

    startPt = null;
    drawingLayer.clearActive();
    renderFn();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      startPt = null;
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
    startPt = null;
    drawingLayer.clearActive();
  };
}

/** 從對角兩點產生矩形的 4 個頂點 (順時針) */
function rectPoints(a: Point, b: Point): Point[] {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

/** 移除現有的 ROI drawing */
function removeExistingRoi(): void {
  const photo = store.getActivePhoto();
  if (!photo) return;
  const existing = photo.drawings.find((d) => d.id.startsWith('roi_'));
  if (existing) {
    store.removeDrawing(existing.id);
  }
}

/** 取得目前的 ROI 座標（給 AI 分析用） */
export function getActiveRoi(): { x1: number; y1: number; x2: number; y2: number } | null {
  const photo = store.getActivePhoto();
  if (!photo) return null;
  const roiShape = photo.drawings.find((d) => d.id.startsWith('roi_'));
  if (!roiShape || roiShape.type !== 'polyline' || roiShape.points_px.length < 4) return null;

  const xs = roiShape.points_px.map((p) => p.x);
  const ys = roiShape.points_px.map((p) => p.y);
  return {
    x1: Math.round(Math.min(...xs)),
    y1: Math.round(Math.min(...ys)),
    x2: Math.round(Math.max(...xs)),
    y2: Math.round(Math.max(...ys)),
  };
}
