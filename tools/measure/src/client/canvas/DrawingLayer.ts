import type { DrawingShape, Point } from '@shared/types.js';
import type { PhotoLayer } from './PhotoLayer.js';

// Renders user drawings on a transparent overlay Canvas
export class DrawingLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private photoLayer: PhotoLayer;

  // Active drawing state (in-progress shape)
  private activePoints: Point[] = [];
  private cursorPos: Point | null = null;

  constructor(canvas: HTMLCanvasElement, photoLayer: PhotoLayer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.photoLayer = photoLayer;

    // Track cursor for live preview
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.cursorPos = this.photoLayer.screenToImage(screenPt.x, screenPt.y);
    });
  }

  render(shapes: DrawingShape[], scaleInfo?: { px_per_mm: number }, highlight?: { shapeId: string; hoveredVertexIndex: number; hoveredEdgeIndex: number; selectedVertexIndex: number }): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const t = this.photoLayer.getTransform();

    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);

    // Draw completed shapes
    for (const shape of shapes) {
      this.drawShape(shape, '#00ff88', 2 / t.scale, t, highlight);
    }

    // Draw in-progress shape
    if (this.activePoints.length > 0) {
      this.drawActivePreview(t.scale);
    }

    // Draw scale bar if calibrated
    if (scaleInfo) {
      this.drawScaleBar(scaleInfo.px_per_mm, t.scale);
    }

    ctx.restore();
  }

  private drawShape(shape: DrawingShape, color: string, lineWidth: number, t?: { scale: number; offsetX: number; offsetY: number }, highlight?: { shapeId: string; hoveredVertexIndex: number; hoveredEdgeIndex: number; selectedVertexIndex: number }): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';

    if (shape.type === 'polyline') {
      if (shape.points_px.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(shape.points_px[0].x, shape.points_px[0].y);
      for (let i = 1; i < shape.points_px.length; i++) {
        ctx.lineTo(shape.points_px[i].x, shape.points_px[i].y);
      }
      if (shape.closed) ctx.closePath();
      ctx.stroke();

      // Vertices
      ctx.fillStyle = color;
      for (const pt of shape.points_px) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / this.photoLayer.getTransform().scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Highlight overlay for edit-contour tool
      if (highlight && shape.id === highlight.shapeId && t) {
        const pts = shape.points_px;
        // Hovered edge in red
        if (highlight.hoveredEdgeIndex >= 0 && highlight.hoveredEdgeIndex < pts.length) {
          const i = highlight.hoveredEdgeIndex;
          const j = (i + 1) % pts.length;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = '#f85149';
          ctx.lineWidth = 4 / t.scale;
          ctx.stroke();
        }
        // Selected vertex in yellow
        if (highlight.selectedVertexIndex >= 0 && highlight.selectedVertexIndex < pts.length) {
          const pt = pts[highlight.selectedVertexIndex];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 8 / t.scale, 0, Math.PI * 2);
          ctx.fillStyle = '#f0e040';
          ctx.fill();
        }
        // Hovered vertex in orange (if different from selected)
        if (highlight.hoveredVertexIndex >= 0 && highlight.hoveredVertexIndex < pts.length && highlight.hoveredVertexIndex !== highlight.selectedVertexIndex) {
          const pt = pts[highlight.hoveredVertexIndex];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6 / t.scale, 0, Math.PI * 2);
          ctx.fillStyle = '#ff8800';
          ctx.fill();
        }
      }
    } else if (shape.type === 'arc') {
      this.drawArc(shape.start, shape.mid, shape.end, color, lineWidth);
    } else if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.arc(shape.center_px.x, shape.center_px.y, shape.radius_px, 0, Math.PI * 2);
      ctx.stroke();

      // Center marker
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(shape.center_px.x, shape.center_px.y, 3 / this.photoLayer.getTransform().scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawArc(start: Point, mid: Point, end: Point, color: string, lineWidth: number): void {
    const { ctx } = this;
    // Calculate circle through 3 points
    const circle = threePointCircle(start, mid, end);
    if (!circle) {
      // Degenerate: draw line
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      return;
    }

    const startAngle = Math.atan2(start.y - circle.cy, start.x - circle.cx);
    const endAngle = Math.atan2(end.y - circle.cy, end.x - circle.cx);
    const midAngle = Math.atan2(mid.y - circle.cy, mid.x - circle.cx);

    // Determine direction
    const ccw = isCounterClockwise(startAngle, midAngle, endAngle);

    ctx.beginPath();
    ctx.arc(circle.cx, circle.cy, circle.r, startAngle, endAngle, ccw);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  private drawActivePreview(viewScale: number): void {
    const { ctx, activePoints, cursorPos } = this;
    if (activePoints.length === 0 || !cursorPos) return;

    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2 / viewScale;
    ctx.setLineDash([6 / viewScale, 4 / viewScale]);

    ctx.beginPath();
    ctx.moveTo(activePoints[0].x, activePoints[0].y);
    for (let i = 1; i < activePoints.length; i++) {
      ctx.lineTo(activePoints[i].x, activePoints[i].y);
    }
    ctx.lineTo(cursorPos.x, cursorPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw placed vertices
    ctx.fillStyle = '#ffaa00';
    for (const pt of activePoints) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 / viewScale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawScaleBar(pxPerMm: number, viewScale: number): void {
    const { ctx } = this;
    const imgSize = this.photoLayer.getImageSize();
    if (imgSize.width === 0) return;

    // Draw a 20mm bar in the bottom-left corner (in image space)
    const barLenMm = 20;
    const barLenPx = barLenMm * pxPerMm;
    const margin = 20;
    const x = margin;
    const y = imgSize.height - margin;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 / viewScale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barLenPx, y);
    ctx.stroke();

    // End caps
    const capH = 8 / viewScale;
    ctx.beginPath();
    ctx.moveTo(x, y - capH);
    ctx.lineTo(x, y + capH);
    ctx.moveTo(x + barLenPx, y - capH);
    ctx.lineTo(x + barLenPx, y + capH);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = `${14 / viewScale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${barLenMm} mm`, x + barLenPx / 2, y - 8 / viewScale);
  }

  setActivePoints(points: Point[]): void {
    this.activePoints = points;
  }

  clearActive(): void {
    this.activePoints = [];
    this.cursorPos = null;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  // Export overlay as PNG data URL (transparent background)
  exportOverlay(shapes: DrawingShape[]): string {
    const imgSize = this.photoLayer.getImageSize();
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = imgSize.width;
    exportCanvas.height = imgSize.height;
    const ctx = exportCanvas.getContext('2d')!;

    // Draw shapes at 1:1 scale
    for (const shape of shapes) {
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';

      if (shape.type === 'polyline') {
        if (shape.points_px.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(shape.points_px[0].x, shape.points_px[0].y);
        for (let i = 1; i < shape.points_px.length; i++) {
          ctx.lineTo(shape.points_px[i].x, shape.points_px[i].y);
        }
        if (shape.closed) ctx.closePath();
        ctx.stroke();
      } else if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(shape.center_px.x, shape.center_px.y, shape.radius_px, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    return exportCanvas.toDataURL('image/png');
  }
}

// ── Geometry helpers ──

function threePointCircle(p1: Point, p2: Point, p3: Point) {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) return null;

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);

  return { cx: ux, cy: uy, r };
}

function isCounterClockwise(startAngle: number, midAngle: number, endAngle: number): boolean {
  const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const s = normalize(startAngle);
  const m = normalize(midAngle);
  const e = normalize(endAngle);

  // Check if mid is between start and end going clockwise
  const cwContains = s > e
    ? (m <= s && m >= e)
    : (m <= s || m >= e);

  return !cwContains;
}
