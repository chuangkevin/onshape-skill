import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

// ── Types ──────────────────────────────────────────────────────────

interface CadPreviewOptions {
  container: HTMLElement;
  contour_mm: { x: number; y: number }[];
  features?: { type: string; center_mm: { x: number; y: number }; radius_mm?: number }[];
  thickness_mm?: number;
  dimensions?: { label: string; value_mm: number }[];
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_THICKNESS = 5;
const HOLE_SEGMENTS = 48;
const EXTRUDE_SEGMENTS = 1;

const MATERIAL_COLOR = 0x8899aa;
const MATERIAL_OPACITY = 0.6;
const WIREFRAME_COLOR = 0x334455;
const BACKGROUND_COLOR = 0x1a1a2e;

const AMBIENT_INTENSITY = 0.6;
const DIR_LIGHT_INTENSITY = 0.8;
const DIR_LIGHT_POSITION = new THREE.Vector3(50, 80, 60);

const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10000;
const FIT_PADDING = 1.4;

// ── Helpers ────────────────────────────────────────────────────────

/** Ensure counter-clockwise winding (required by Three.js Shape) */
function ensureCCW(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  // Signed area: positive = CCW, negative = CW
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area >= 0 ? pts : [...pts].reverse();
}

/**
 * Circular moving-average smoothing to reduce noisy contour points.
 * window=5 removes high-frequency zigzags while preserving corners.
 */
function smoothContour(
  pts: { x: number; y: number }[],
  window = 5,
): { x: number; y: number }[] {
  const n = pts.length;
  if (n <= window) return pts;
  const half = Math.floor(window / 2);
  return pts.map((_, i) => {
    let sx = 0, sy = 0;
    for (let j = -half; j <= half; j++) {
      const idx = (i + j + n) % n;
      sx += pts[idx].x;
      sy += pts[idx].y;
    }
    return { x: sx / window, y: sy / window };
  });
}

/** Douglas-Peucker simplification for preview (reduce triangulation complexity) */
function simplifyForPreview(pts: { x: number; y: number }[], maxPts = 24): { x: number; y: number }[] {
  if (pts.length <= maxPts) return pts;

  function perpDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function dp(points: { x: number; y: number }[], eps: number): { x: number; y: number }[] {
    if (points.length <= 2) return points;
    let maxD = 0, maxI = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const d = perpDist(points[i], points[0], points[points.length - 1]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      const left = dp(points.slice(0, maxI + 1), eps);
      const right = dp(points.slice(maxI), eps);
      return [...left.slice(0, -1), ...right];
    }
    return [points[0], points[points.length - 1]];
  }

  // Binary search for epsilon that gives ~maxPts
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  let lo = 0, hi = diag * 0.1, best = pts;
  for (let i = 0; i < 15; i++) {
    const mid = (lo + hi) / 2;
    const r = dp(pts, mid);
    if (r.length > maxPts) lo = mid; else hi = mid;
    best = r;
    if (r.length >= maxPts - 5 && r.length <= maxPts) break;
  }
  return best;
}

function buildShape(
  contour: { x: number; y: number }[],
  features?: CadPreviewOptions['features'],
): THREE.Shape {
  const shape = new THREE.Shape();

  if (contour.length === 0) return shape;

  // Simplify to control points then fit closed CatmullRom spline for smooth surface
  let pts = simplifyForPreview(contour, 24);
  pts = ensureCCW(pts);

  // Build a closed CatmullRom spline through the simplified control points,
  // then sample many smooth points for triangulation (no jagged edges)
  const splineCtrl = pts.map(p => new THREE.Vector3(p.x, p.y, 0));
  const splineCurve = new THREE.CatmullRomCurve3(splineCtrl, true /* closed */);
  const splineSampled = splineCurve.getPoints(120).map(v => ({ x: v.x, y: v.y }));

  shape.moveTo(splineSampled[0].x, splineSampled[0].y);
  for (let i = 1; i < splineSampled.length; i++) {
    shape.lineTo(splineSampled[i].x, splineSampled[i].y);
  }
  shape.closePath();

  // Cut holes for circle features
  if (features) {
    for (const feat of features) {
      if (feat.type === 'hole' && feat.radius_mm && feat.radius_mm > 0) {
        const hole = new THREE.Path();
        hole.absellipse(
          feat.center_mm.x,
          feat.center_mm.y,
          feat.radius_mm,
          feat.radius_mm,
          0,
          Math.PI * 2,
          false,
          0,
        );
        shape.holes.push(hole);
      }
    }
  }

  return shape;
}

function createMesh(shape: THREE.Shape, thickness: number): THREE.Group {
  const group = new THREE.Group();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: thickness,
    bevelEnabled: false,
    steps: EXTRUDE_SEGMENTS,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Solid semi-transparent body
  const solidMat = new THREE.MeshPhysicalMaterial({
    color: MATERIAL_COLOR,
    transparent: true,
    opacity: MATERIAL_OPACITY,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const solidMesh = new THREE.Mesh(geometry, solidMat);
  group.add(solidMesh);

  // Wireframe overlay
  const wireMat = new THREE.MeshBasicMaterial({
    color: WIREFRAME_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const wireMesh = new THREE.Mesh(geometry.clone(), wireMat);
  group.add(wireMesh);

  return group;
}

function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: TrackballControls,
  object: THREE.Object3D,
): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
  cameraDistance *= FIT_PADDING;

  // Position camera at an isometric-ish angle
  camera.position.set(
    center.x + cameraDistance * 0.5,
    center.y + cameraDistance * 0.6,
    center.z + cameraDistance * 0.8,
  );

  controls.target.copy(center);
  camera.near = cameraDistance / 100;
  camera.far = cameraDistance * 10;
  camera.updateProjectionMatrix();
  controls.update();
}

// ── Dimension Annotations ──────────────────────────────────────────

function createDimensionOverlay(
  container: HTMLElement,
  dimensions: CadPreviewOptions['dimensions'],
): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; top: 8px; right: 8px;
    display: flex; flex-direction: column; gap: 4px;
    pointer-events: none; z-index: 10;
  `;

  if (dimensions && dimensions.length > 0) {
    for (const dim of dimensions) {
      const tag = document.createElement('div');
      tag.style.cssText = `
        background: rgba(0,0,0,0.7); color: #e0e0e0;
        padding: 3px 8px; border-radius: 3px;
        font: 12px/1.4 monospace; white-space: nowrap;
        border-left: 3px solid #4fc3f7;
      `;
      tag.textContent = `${dim.label}: ${dim.value_mm.toFixed(2)} mm`;
      overlay.appendChild(tag);
    }
  }

  container.appendChild(overlay);
  return overlay;
}

// ── Public API ─────────────────────────────────────────────────────

export function createCadPreview(options: CadPreviewOptions): { dispose: () => void } {
  const {
    container,
    contour_mm,
    features,
    thickness_mm = DEFAULT_THICKNESS,
    dimensions,
  } = options;

  // Ensure container is positioned for overlay children
  const pos = getComputedStyle(container).position;
  if (pos === 'static') {
    container.style.position = 'relative';
  }

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(BACKGROUND_COLOR);
  // Required for OrbitControls touch events on mobile — prevents browser
  // scroll/zoom from intercepting pointer events on the canvas.
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  // ── Scene ──
  const scene = new THREE.Scene();

  // ── Lights ──
  const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY);
  dirLight.position.copy(DIR_LIGHT_POSITION);
  scene.add(dirLight);

  // ── Camera + Controls ──
  const aspect = container.clientWidth / container.clientHeight || 1;
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  // TrackballControls: true spherical orbit with no up-vector constraint
  // Drag any direction → camera rotates freely (no gimbal lock, no polar lock)
  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 2.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.15;
  controls.keys = ['KeyA', 'KeyS', 'KeyD'];

  // ── Model ──
  const shape = buildShape(contour_mm, features);
  const modelGroup = createMesh(shape, thickness_mm);
  scene.add(modelGroup);

  fitCameraToObject(camera, controls, modelGroup);

  // ── Dimension overlay ──
  const overlay = createDimensionOverlay(container, dimensions);

  // ── Render loop ──
  let animationId = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ── Resize handling ──
  function onResize() {
    if (disposed) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    controls.handleResize();
  }

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  // ── Cleanup ──
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationId);
    resizeObserver.disconnect();
    controls.dispose();

    // Dispose geometries and materials
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });

    renderer.dispose();

    // Remove DOM elements
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
    if (overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
  }

  return { dispose };
}
