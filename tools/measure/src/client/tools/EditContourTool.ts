import type { Point, PolylineShape } from '@shared/types.js';
import type { PhotoLayer } from '../canvas/PhotoLayer.js';
import { store } from '../state/store.js';

export interface ContourHighlight {
  shapeId: string;
  hoveredVertexIndex: number;   // -1 if none
  hoveredEdgeIndex: number;     // -1 if none
  selectedVertexIndex: number;  // -1 if none
}

let highlight: ContourHighlight = {
  shapeId: '',
  hoveredVertexIndex: -1,
  hoveredEdgeIndex: -1,
  selectedVertexIndex: -1,
};

export function getContourHighlight(): ContourHighlight {
  return highlight;
}

export function activateEditContourTool(
  drawingCanvas: HTMLCanvasElement,
  photoLayer: PhotoLayer,
  renderFn: () => void,
  targetShapeId: string = 'auto_contour',
): () => void {
  highlight = {
    shapeId: targetShapeId,
    hoveredVertexIndex: -1,
    hoveredEdgeIndex: -1,
    selectedVertexIndex: -1,
  };

  let isDragging = false;

  function getShape(): PolylineShape | null {
    const photo = store.getActivePhoto();
    if (!photo) return null;
    return (
      (photo.drawings.find(
        (d) => d.id === targetShapeId && d.type === 'polyline',
      ) as PolylineShape | undefined) ?? null
    );
  }

  function updateShapePoints(shape: PolylineShape, newPoints: Point[]): void {
    store.removeDrawing(targetShapeId);
    store.addDrawing({ ...shape, points_px: newPoints });
  }

  function findNearest(imgPt: Point): {
    vertexIdx: number;
    edgeIdx: number;
    vertexDist: number;
    edgeDist: number;
  } {
    const shape = getShape();
    if (!shape || shape.points_px.length === 0) {
      return { vertexIdx: -1, edgeIdx: -1, vertexDist: Infinity, edgeDist: Infinity };
    }

    const pts = shape.points_px;
    let bestVertexIdx = -1;
    let bestVertexDist = Infinity;
    let bestEdgeIdx = -1;
    let bestEdgeDist = Infinity;

    for (let i = 0; i < pts.length; i++) {
      const d = Math.sqrt((imgPt.x - pts[i].x) ** 2 + (imgPt.y - pts[i].y) ** 2);
      if (d < bestVertexDist) {
        bestVertexDist = d;
        bestVertexIdx = i;
      }
    }

    const edgeCount = shape.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < edgeCount; i++) {
      const j = (i + 1) % pts.length;
      const d = pointToSegmentDist(imgPt, pts[i], pts[j]);
      if (d < bestEdgeDist) {
        bestEdgeDist = d;
        bestEdgeIdx = i;
      }
    }

    return { vertexIdx: bestVertexIdx, edgeIdx: bestEdgeIdx, vertexDist: bestVertexDist, edgeDist: bestEdgeDist };
  }

  const VERTEX_THRESHOLD = 15; // px in image space

  const onPointerMove = (e: PointerEvent) => {
    if (photoLayer.isPanningNow) return;

    const rect = drawingCanvas.getBoundingClientRect();
    const imgPt = photoLayer.screenToImage(e.clientX - rect.left, e.clientY - rect.top);

    if (isDragging && highlight.selectedVertexIndex >= 0) {
      const shape = getShape();
      if (shape) {
        const newPoints = [...shape.points_px];
        newPoints[highlight.selectedVertexIndex] = imgPt;
        updateShapePoints(shape, newPoints);
      }
      renderFn();
      return;
    }

    const nearest = findNearest(imgPt);

    if (nearest.vertexDist < VERTEX_THRESHOLD) {
      highlight = { ...highlight, hoveredVertexIndex: nearest.vertexIdx, hoveredEdgeIndex: -1 };
      drawingCanvas.style.cursor = 'grab';
    } else if (nearest.edgeDist < VERTEX_THRESHOLD) {
      highlight = { ...highlight, hoveredVertexIndex: -1, hoveredEdgeIndex: nearest.edgeIdx };
      drawingCanvas.style.cursor = 'pointer';
    } else {
      highlight = { ...highlight, hoveredVertexIndex: -1, hoveredEdgeIndex: -1 };
      drawingCanvas.style.cursor = 'crosshair';
    }

    renderFn();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.ctrlKey) return;
    if (e.button !== 0 || photoLayer.isPanningNow) return;

    if (highlight.hoveredVertexIndex >= 0) {
      highlight.selectedVertexIndex = highlight.hoveredVertexIndex;
      isDragging = true;
      drawingCanvas.setPointerCapture(e.pointerId);
      drawingCanvas.style.cursor = 'grabbing';
      e.preventDefault();
      e.stopPropagation();
      renderFn();
    } else {
      highlight.selectedVertexIndex = -1;
      renderFn();
    }
  };

  const onPointerUp = (_e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      drawingCanvas.style.cursor = 'crosshair';
    }
  };

  const onDblClick = (e: MouseEvent) => {
    if (highlight.hoveredEdgeIndex < 0) return;
    const shape = getShape();
    if (!shape) return;

    const rect = drawingCanvas.getBoundingClientRect();
    const imgPt = photoLayer.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    const insertIdx = highlight.hoveredEdgeIndex + 1;

    const newPoints = [...shape.points_px];
    newPoints.splice(insertIdx, 0, imgPt);

    updateShapePoints(shape, newPoints);
    highlight.selectedVertexIndex = insertIdx;
    renderFn();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && highlight.selectedVertexIndex >= 0) {
      const shape = getShape();
      if (!shape || shape.points_px.length <= 3) return; // Keep at least 3 points

      const newPoints = [...shape.points_px];
      newPoints.splice(highlight.selectedVertexIndex, 1);

      updateShapePoints(shape, newPoints);

      highlight.selectedVertexIndex = -1;
      highlight.hoveredVertexIndex = -1;
      renderFn();
    }
  };

  drawingCanvas.addEventListener('pointermove', onPointerMove);
  drawingCanvas.addEventListener('pointerdown', onPointerDown);
  drawingCanvas.addEventListener('pointerup', onPointerUp);
  drawingCanvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    drawingCanvas.removeEventListener('pointermove', onPointerMove);
    drawingCanvas.removeEventListener('pointerdown', onPointerDown);
    drawingCanvas.removeEventListener('pointerup', onPointerUp);
    drawingCanvas.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKeyDown);
    highlight = { shapeId: '', hoveredVertexIndex: -1, hoveredEdgeIndex: -1, selectedVertexIndex: -1 };
    drawingCanvas.style.cursor = 'crosshair';
  };
}

// ── Geometry helper ──

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}
