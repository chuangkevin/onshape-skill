import { PhotoLayer } from './canvas/PhotoLayer.js';
import { DrawingLayer } from './canvas/DrawingLayer.js';
import { store, type ToolType, type PhotoState } from './state/store.js';
import { activatePolylineTool } from './tools/PolylineTool.js';
import { activateArcTool } from './tools/ArcTool.js';
import { activateScaleTool } from './tools/ScaleTool.js';
import { activateHoleTool } from './tools/HoleTool.js';
import { activateSelectTool } from './tools/SelectTool.js';
import * as api from './api/client.js';
import type { ViewAngle } from '@shared/types.js';

// ── DOM Elements ──
const photoCanvas = document.getElementById('photoCanvas') as HTMLCanvasElement;
const drawingCanvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
const workspace = document.getElementById('workspace') as HTMLDivElement;
const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const dropzoneBox = document.getElementById('dropzoneBox') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const addPhotoBtn = document.getElementById('addPhotoBtn') as HTMLButtonElement;
const photoList = document.getElementById('photoList') as HTMLDivElement;
const angleSelect = document.getElementById('angleSelect') as HTMLSelectElement;
const scaleInfo = document.getElementById('scaleInfo') as HTMLDivElement;
const featureList = document.getElementById('featureList') as HTMLDivElement;
const dimensionList = document.getElementById('dimensionList') as HTMLDivElement;
const statusCoords = document.getElementById('statusCoords') as HTMLSpanElement;
const statusScale = document.getElementById('statusScale') as HTMLSpanElement;
const statusTool = document.getElementById('statusTool') as HTMLSpanElement;
const projectName = document.getElementById('projectName') as HTMLSpanElement;

// ── Canvas Layers ──
const photoLayer = new PhotoLayer(photoCanvas);
const drawingLayer = new DrawingLayer(drawingCanvas, photoLayer);

// ── Tool Management ──
let cleanupTool: (() => void) | null = null;

function activateTool(tool: ToolType): void {
  if (cleanupTool) cleanupTool();

  switch (tool) {
    case 'select':
      cleanupTool = activateSelectTool(drawingCanvas, photoLayer, renderDrawings);
      break;
    case 'polyline':
      cleanupTool = activatePolylineTool(drawingCanvas, photoLayer, drawingLayer, renderDrawings);
      break;
    case 'arc':
      cleanupTool = activateArcTool(drawingCanvas, photoLayer, drawingLayer, renderDrawings);
      break;
    case 'hole':
      cleanupTool = activateHoleTool(drawingCanvas, photoLayer, drawingLayer, renderDrawings);
      break;
    case 'scale':
      cleanupTool = activateScaleTool(drawingCanvas, photoLayer, drawingLayer, renderDrawings);
      break;
  }

  store.setActiveTool(tool);
}

// ── Rendering ──
function renderDrawings(): void {
  const photo = store.getActivePhoto();
  if (!photo) return;
  drawingLayer.render(
    photo.drawings,
    photo.scale ? { px_per_mm: photo.scale.px_per_mm } : undefined,
  );
}

function renderUI(): void {
  const state = store.getState();
  const photo = store.getActivePhoto();

  // Project name
  projectName.textContent = state.projectName || 'No project';

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === state.activeTool);
  });
  statusTool.textContent = `Tool: ${state.activeTool}`;

  // Photo list
  photoList.innerHTML = state.photos
    .map(
      (p, i) => `
    <div class="photo-thumb ${i === state.activePhotoIndex ? 'active' : ''}" data-index="${i}">
      <img src="/uploads/${p.filename}" alt="${p.originalName}" />
      <span>${p.originalName}</span>
    </div>
  `,
    )
    .join('');

  // Dropzone visibility
  dropzone.classList.toggle('hidden', state.photos.length > 0);

  // Right panel
  if (photo) {
    angleSelect.value = photo.angle;

    if (photo.scale) {
      scaleInfo.textContent = `${photo.scale.px_per_mm.toFixed(2)} px/mm (${photo.scale.distance_mm}mm ref)`;
      statusScale.textContent = `Scale: ${photo.scale.px_per_mm.toFixed(2)} px/mm`;
    } else {
      scaleInfo.textContent = 'Not calibrated — use Scale tool';
      statusScale.textContent = 'Scale: -';
    }

    // Features
    featureList.innerHTML = photo.features
      .map(
        (f) => `
      <div class="feature-item">
        <span>${f.type}: ${f.label}</span>
        <button class="delete-btn" data-feat-id="${f.id}" type="button">&times;</button>
      </div>
    `,
      )
      .join('') || '<p style="font-size:13px;color:#8b949e;">No features</p>';

    // Dimensions
    dimensionList.innerHTML = photo.dimensions
      .map(
        (d) => `
      <div class="feature-item">
        <span>${d.location}: ${d.value_mm}mm</span>
        <button class="delete-btn" data-dim-id="${d.id}" type="button">&times;</button>
      </div>
    `,
      )
      .join('') || '<p style="font-size:13px;color:#8b949e;">No dimensions</p>';
  }
}

// ── Canvas Sizing ──
function resizeCanvases(): void {
  const rect = workspace.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  photoLayer.resize(w, h);
  drawingLayer.resize(w, h);
  renderDrawings();
}

// ── Photo Loading ──
async function loadPhoto(photo: PhotoState): Promise<void> {
  await photoLayer.loadImage(`/uploads/${photo.filename}`);
  renderDrawings();
}

// ── File Upload ──
async function handleFiles(files: FileList | File[]): Promise<void> {
  const state = store.getState();
  let projectId = state.projectId;

  // Auto-create project if none exists
  if (!projectId) {
    const name = prompt('Project name:', 'New Measurement') || 'New Measurement';
    const project = await api.createProject(name);
    projectId = project.id;
    store.setProject(project.id, project.name);
  }

  const uploaded = await api.uploadPhotos(projectId, files);
  const photos: PhotoState[] = [
    ...store.getState().photos,
    ...uploaded.map((p) => ({
      id: p.id,
      filename: p.filename,
      originalName: p.original_name,
      angle: (p.angle || 'top') as ViewAngle,
      scale: null,
      drawings: [],
      features: [],
      dimensions: [],
    })),
  ];
  store.setPhotos(photos);
  await loadPhoto(photos[photos.length - 1]);
  renderUI();
}

// ── Event Handlers ──
function setupEvents(): void {
  // File input
  addPhotoBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) handleFiles(fileInput.files);
  });

  // Dropzone
  dropzoneBox.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzoneBox.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzoneBox.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzoneBox.classList.remove('dragover');
    if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
  });

  // Photo thumbnail clicks
  photoList.addEventListener('click', async (e) => {
    const thumb = (e.target as HTMLElement).closest('.photo-thumb') as HTMLElement;
    if (!thumb) return;
    const index = parseInt(thumb.dataset.index!, 10);
    store.setActivePhoto(index);
    await loadPhoto(store.getActivePhoto()!);
    renderUI();
    renderDrawings();
  });

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activateTool((btn as HTMLElement).dataset.tool as ToolType);
      renderUI();
    });
  });

  // Undo / Redo
  document.getElementById('undoBtn')!.addEventListener('click', () => {
    store.undo();
    renderDrawings();
    renderUI();
  });
  document.getElementById('redoBtn')!.addEventListener('click', () => {
    store.redo();
    renderDrawings();
    renderUI();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      store.undo();
      renderDrawings();
      renderUI();
    }
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      store.redo();
      renderDrawings();
      renderUI();
    }
  });

  // Angle select
  angleSelect.addEventListener('change', () => {
    store.setPhotoAngle(angleSelect.value as ViewAngle);
    const photo = store.getActivePhoto();
    if (photo && store.getState().projectId) {
      api.updatePhoto(store.getState().projectId!, photo.id, { angle: angleSelect.value });
    }
  });

  // Feature delete
  featureList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.delete-btn') as HTMLElement;
    if (!btn) return;
    const id = btn.dataset.featId;
    if (id) {
      store.removeFeature(id);
      renderDrawings();
      renderUI();
    }
  });

  // Dimension delete
  dimensionList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.delete-btn') as HTMLElement;
    if (!btn) return;
    const id = btn.dataset.dimId;
    if (id) {
      store.removeDimension(id);
      renderUI();
    }
  });

  // Add dimension
  document.getElementById('addDimBtn')!.addEventListener('click', () => {
    const locInput = document.getElementById('dimLocation') as HTMLInputElement;
    const valInput = document.getElementById('dimValue') as HTMLInputElement;
    const location = locInput.value.trim();
    const value = parseFloat(valInput.value);
    if (location && value > 0) {
      store.addDimension({
        id: `dim_${Date.now()}`,
        location,
        value_mm: value,
        source: 'user_input',
      });
      locInput.value = '';
      valInput.value = '';
      renderUI();
    }
  });

  // Analyze
  document.getElementById('analyzeBtn')!.addEventListener('click', async () => {
    const projectId = store.getState().projectId;
    if (!projectId) return alert('Create a project first');
    const result = await api.analyzeProject(projectId);
    alert(JSON.stringify(result, null, 2));
  });

  // Export JSON
  document.getElementById('exportBtn')!.addEventListener('click', async () => {
    const projectId = store.getState().projectId;
    if (!projectId) return alert('Create a project first');
    const result = await api.exportMeasurement(projectId);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'measurement.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Copy JSON
  document.getElementById('copyJsonBtn')!.addEventListener('click', async () => {
    const projectId = store.getState().projectId;
    if (!projectId) return alert('Create a project first');
    const result = await api.exportMeasurement(projectId);
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    alert('JSON copied to clipboard');
  });

  // Mouse coordinate tracking
  drawingCanvas.addEventListener('pointermove', (e) => {
    const rect = drawingCanvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const imgPt = photoLayer.screenToImage(screenPt.x, screenPt.y);
    const photo = store.getActivePhoto();
    if (photo?.scale) {
      const mmX = (imgPt.x / photo.scale.px_per_mm).toFixed(1);
      const mmY = (imgPt.y / photo.scale.px_per_mm).toFixed(1);
      statusCoords.textContent = `${mmX}, ${mmY} mm (px: ${imgPt.x.toFixed(0)}, ${imgPt.y.toFixed(0)})`;
    } else {
      statusCoords.textContent = `px: ${imgPt.x.toFixed(0)}, ${imgPt.y.toFixed(0)}`;
    }
  });

  // Transform changes → re-render drawing layer
  photoCanvas.addEventListener('transform-change', () => renderDrawings());

  // Window resize
  window.addEventListener('resize', resizeCanvases);
}

// ── Init ──
async function init(): Promise<void> {
  resizeCanvases();
  setupEvents();
  activateTool('select');
  renderUI();

  // Check for existing projects
  const projects = await api.listProjects();
  if (projects.length > 0) {
    const latest = projects[0];
    store.setProject(latest.id, latest.name);
    const photos = await api.listPhotos(latest.id);
    if (photos.length > 0) {
      store.setPhotos(
        photos.map((p) => ({
          id: p.id,
          filename: p.filename,
          originalName: p.original_name,
          angle: (p.angle || 'top') as ViewAngle,
          scale: p.scale_data ? JSON.parse(p.scale_data) : null,
          drawings: [],
          features: [],
          dimensions: [],
        })),
      );
      await loadPhoto(store.getActivePhoto()!);
    }
    renderUI();
  }
}

init();
