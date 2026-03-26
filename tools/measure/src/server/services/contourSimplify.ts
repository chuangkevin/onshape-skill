/**
 * Contour simplification + semantic feature extraction for CAD modeling.
 * Takes raw FastSAM contour (40-200 points) → simplified geometry with tabs/holes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface Tab {
  edge: 'top' | 'bottom' | 'left' | 'right';
  center_mm: { x: number; y: number };
  width_mm: number;
  depth_mm: number;
}

export interface SimplifiedGeometry {
  boundingBox: { x: number; y: number; width: number; height: number };
  simplified_points_mm: { x: number; y: number }[];
  tabs: Tab[];
  holes: { center_mm: { x: number; y: number }; radius_mm: number }[];
}

type Pt = { x: number; y: number };

// ── Douglas-Peucker Simplification ───────────────────────────────────────────

function perpendicularDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function douglasPeucker(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length <= 2) return pts;

  let maxDist = 0;
  let maxIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDist(pts[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** Simplify to target 20-40 points using binary search on epsilon */
function simplifyToTarget(pts: Pt[], minPts = 20, maxPts = 40): Pt[] {
  if (pts.length <= maxPts) return pts;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  let lo = 0, hi = diag * 0.1;
  let best = pts;

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const result = douglasPeucker(pts, mid);
    if (result.length > maxPts) {
      lo = mid;
    } else if (result.length < minPts) {
      hi = mid;
    } else {
      best = result;
      break;
    }
    best = result;
  }
  return best;
}

// ── Tab Detection ────────────────────────────────────────────────────────────

interface EdgeProj {
  edge: 'top' | 'bottom' | 'left' | 'right';
  /** Position along the edge (x for top/bottom, y for left/right) */
  along: number;
  /** How far the point protrudes beyond the body line */
  depth: number;
}

function detectTabs(pts: Pt[], bbox: { x: number; y: number; width: number; height: number }): Tab[] {
  const { x: bx, y: by, width: bw, height: bh } = bbox;
  const centerX = bx + bw / 2;
  const centerY = by + bh / 2;

  // For each edge, collect protrusion depths
  const edgeData: Record<string, EdgeProj[]> = { top: [], bottom: [], left: [], right: [] };

  for (const p of pts) {
    // Top edge: points with y < by + 15% of height
    if (p.y < by + bh * 0.15) {
      edgeData.top.push({ edge: 'top', along: p.x, depth: by - p.y });
    }
    // Bottom edge: points with y > by + bh - 15% of height
    if (p.y > by + bh * 0.85) {
      edgeData.bottom.push({ edge: 'bottom', along: p.x, depth: p.y - (by + bh) });
    }
    // Left edge: points with x < bx + 15% of width
    if (p.x < bx + bw * 0.15) {
      edgeData.left.push({ edge: 'left', along: p.y, depth: bx - p.x });
    }
    // Right edge: points with x > bx + bw - 15% of width
    if (p.x > bx + bw * 0.85) {
      edgeData.right.push({ edge: 'right', along: p.y, depth: p.x - (bx + bw) });
    }
  }

  const tabs: Tab[] = [];

  for (const [edgeName, projs] of Object.entries(edgeData)) {
    if (projs.length < 3) continue;
    const edge = edgeName as Tab['edge'];

    // Find body line = median depth (most points are on the body edge, depth ≈ 0)
    const depths = projs.map(p => p.depth);
    depths.sort((a, b) => a - b);
    const bodyLine = depths[Math.floor(depths.length * 0.5)];

    // Find points that protrude beyond body line + threshold
    const threshold = Math.max(2, (edge === 'top' || edge === 'bottom' ? bh : bw) * 0.03);
    const protruding = projs
      .filter(p => p.depth > bodyLine + threshold)
      .sort((a, b) => a.along - b.along);

    if (protruding.length < 2) continue;

    // Cluster contiguous protrusions (gap > 5mm = new cluster)
    const clusters: EdgeProj[][] = [[]];
    for (let i = 0; i < protruding.length; i++) {
      if (i > 0 && protruding[i].along - protruding[i - 1].along > 5) {
        clusters.push([]);
      }
      clusters[clusters.length - 1].push(protruding[i]);
    }

    // Each cluster → potential tab
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const alongs = cluster.map(p => p.along);
      const clusterDepths = cluster.map(p => p.depth - bodyLine);
      const width = Math.max(...alongs) - Math.min(...alongs);
      const meanDepth = clusterDepths.reduce((s, d) => s + d, 0) / clusterDepths.length;

      // Filter: min 3mm wide, min 2mm deep, depth consistent (±40%)
      if (width < 3 || meanDepth < 2) continue;
      const depthVar = Math.max(...clusterDepths) - Math.min(...clusterDepths);
      if (depthVar > meanDepth * 0.8) continue; // too inconsistent

      const centerAlong = (Math.min(...alongs) + Math.max(...alongs)) / 2;
      const center: Pt = (edge === 'top' || edge === 'bottom')
        ? { x: centerAlong, y: edge === 'top' ? by - meanDepth / 2 : by + bh + meanDepth / 2 }
        : { x: edge === 'left' ? bx - meanDepth / 2 : bx + bw + meanDepth / 2, y: centerAlong };

      tabs.push({ edge, center_mm: center, width_mm: Math.round(width * 10) / 10, depth_mm: Math.round(meanDepth * 10) / 10 });
    }
  }

  return tabs;
}

// ── Main Function ────────────────────────────────────────────────────────────

export function simplifyContour(
  contour_mm: Pt[],
  holes?: { center_mm: Pt; radius_mm: number }[],
): SimplifiedGeometry {
  if (contour_mm.length === 0) {
    return {
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      simplified_points_mm: [],
      tabs: [],
      holes: holes ?? [],
    };
  }

  // Bounding box
  const xs = contour_mm.map(p => p.x);
  const ys = contour_mm.map(p => p.y);
  const bbox = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };

  // Simplify
  const simplified = simplifyToTarget(contour_mm, 20, 40);

  // Detect tabs
  const tabs = detectTabs(contour_mm, bbox); // Use full resolution for tab detection

  return {
    boundingBox: bbox,
    simplified_points_mm: simplified,
    tabs,
    holes: holes ?? [],
  };
}
