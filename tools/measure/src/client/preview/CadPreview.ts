import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

function buildShape(
  contour: { x: number; y: number }[],
  features?: CadPreviewOptions['features'],
): THREE.Shape {
  const shape = new THREE.Shape();

  if (contour.length === 0) return shape;

  shape.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i++) {
    shape.lineTo(contour[i].x, contour[i].y);
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
  controls: OrbitControls,
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
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };

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
