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
const projectNameEl = document.getElementById('projectName') as HTMLSpanElement;
const toolHint = document.getElementById('toolHint') as HTMLDivElement;
const analysisResults = document.getElementById('analysisResults') as HTMLDivElement;

// ── Tool hints (Traditional Chinese) ──
const TOOL_HINTS: Record<string, string> = {
  select: '點擊選取圖形，按 Delete 刪除',
  polyline: '沿零件邊緣逐點點擊，按 Enter 或雙擊結束封閉輪廓',
  arc: '依序點擊起點、中點、終點繪製弧線',
  hole: '在圓孔中心按住拖曳到邊緣，自動計算半徑',
  scale: '第一步：在照片中的尺規上點擊兩個刻度點',
};

const TOOL_NAMES: Record<string, string> = {
  select: '選取', polyline: '多邊形', arc: '弧線', hole: '圓孔', scale: '比例尺',
};

// ── Canvas Layers ──
const photoLayer = new PhotoLayer(photoCanvas);
const drawingLayer = new DrawingLayer(drawingCanvas, photoLayer);

// Attach pan/zoom events to drawingCanvas (the top layer that receives events)
photoLayer.attachEvents(drawingCanvas);

// Auto-advance when state changes
store.subscribe(() => {
  autoAdvance();
});

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
  showToolHint(tool);
}

let hintTimer: ReturnType<typeof setTimeout> | null = null;
function showToolHint(tool: string): void {
  const hint = TOOL_HINTS[tool];
  if (hintTimer) clearTimeout(hintTimer);
  if (hint) {
    toolHint.textContent = hint;
    toolHint.classList.remove('hidden');
    hintTimer = setTimeout(() => toolHint.classList.add('hidden'), 6000);
  } else {
    toolHint.classList.add('hidden');
  }
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

function getCurrentStep(): number {
  const state = store.getState();
  const photo = store.getActivePhoto();
  if (state.photos.length === 0) return 1;
  if (!photo?.scale) return 2;
  if (photo.drawings.length === 0) return 3;
  return 4; // features or ready to analyze
}

function updateGuide(): void {
  const currentStep = getCurrentStep();
  const steps = document.querySelectorAll('.guide-step');

  steps.forEach((el) => {
    const step = parseInt((el as HTMLElement).dataset.step || '0');
    el.classList.remove('active', 'done');
    if (step < currentStep) el.classList.add('done');
    else if (step === currentStep) el.classList.add('active');
  });

  // Show next-step button in the guide
  const nextStepActions: Record<number, { label: string; action: () => void }> = {
    2: { label: '開始校準比例尺', action: () => { activateTool('scale'); renderUI(); } },
    3: { label: '開始描繪輪廓', action: () => { activateTool('polyline'); renderUI(); } },
    4: { label: '進行 AI 分析', action: () => document.getElementById('analyzeBtn')!.click() },
  };

  const existing = document.getElementById('nextStepBtn');
  if (existing) existing.remove();

  const next = nextStepActions[currentStep];
  if (next) {
    const btn = document.createElement('button');
    btn.id = 'nextStepBtn';
    btn.type = 'button';
    btn.className = 'action-btn primary';
    btn.style.marginTop = '8px';
    btn.textContent = `>>> ${next.label}`;
    btn.addEventListener('click', next.action);
    document.getElementById('guidePanel')!.appendChild(btn);
  }
}

/** Auto-advance tool after completing a step */
function autoAdvance(): void {
  const step = getCurrentStep();
  const photo = store.getActivePhoto();
  const currentTool = store.getState().activeTool;

  // After scale calibration → switch to polyline
  if (step === 3 && currentTool === 'scale' && photo?.scale) {
    setTimeout(() => {
      activateTool('polyline');
      renderUI();
    }, 300);
  }
}

function renderUI(): void {
  const state = store.getState();
  const photo = store.getActivePhoto();

  // Project name
  projectNameEl.textContent = state.projectName || '尚無專案';

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === state.activeTool);
  });
  statusTool.textContent = `工具：${TOOL_NAMES[state.activeTool] ?? state.activeTool}`;

  // Photo list
  photoList.innerHTML = state.photos
    .map(
      (p, i) => `
    <div class="photo-thumb ${i === state.activePhotoIndex ? 'active' : ''}" data-index="${i}">
      <img src="/uploads/${p.filename}" alt="${p.originalName}" />
      <span>${p.originalName}</span>
    </div>
  `)
    .join('');

  // Dropzone visibility
  dropzone.classList.toggle('hidden', state.photos.length > 0);

  // Right panel
  if (photo) {
    angleSelect.value = photo.angle;

    if (photo.scale) {
      scaleInfo.textContent = `${photo.scale.px_per_mm.toFixed(2)} px/mm（參考距離 ${photo.scale.distance_mm}mm）`;
      statusScale.textContent = `比例尺：${photo.scale.px_per_mm.toFixed(2)} px/mm`;
    } else {
      scaleInfo.textContent = '尚未校準 — 請使用比例尺工具';
      statusScale.textContent = '比例尺：-';
    }

    featureList.innerHTML = photo.features
      .map((f) => `
      <div class="feature-item">
        <span>${f.type}: ${f.label}</span>
        <button class="delete-btn" data-feat-id="${f.id}" type="button">&times;</button>
      </div>`)
      .join('') || '<p style="font-size:13px;color:#8b949e;">無標記特徵</p>';

    dimensionList.innerHTML = photo.dimensions
      .map((d) => `
      <div class="feature-item">
        <span>${d.location}: ${d.value_mm}mm</span>
        <button class="delete-btn" data-dim-id="${d.id}" type="button">&times;</button>
      </div>`)
      .join('') || '<p style="font-size:13px;color:#8b949e;">無手動尺寸</p>';
  }

  updateGuide();
}

// ── Canvas Sizing ──
function resizeCanvases(): void {
  const rect = workspace.getBoundingClientRect();
  photoLayer.resize(rect.width, rect.height);
  drawingLayer.resize(rect.width, rect.height);
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

  if (!projectId) {
    const name = prompt('請輸入專案名稱：', '新量測專案') || '新量測專案';
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

  // Auto-advance: switch to scale tool after first upload
  setTimeout(() => {
    activateTool('scale');
    renderUI();
  }, 500);
}

// ── AI Analysis Display ──
function showAnalysisLoading(): void {
  analysisResults.innerHTML = `
    <div class="results-panel">
      <h4><span class="loading-spinner"></span> AI 分析中...</h4>
      <p style="color:#8b949e;margin-top:6px;">正在使用 Gemini 進行 OCR、標籤辨識和形狀分析</p>
    </div>`;
}

function showAnalysisResult(result: any): void {
  const ai = result.result?.ai;
  const opencv = result.result?.opencv;

  let html = '<div class="results-panel"><h4>分析結果</h4>';

  // OCR readings
  if (ai?.ocr_readings?.length > 0) {
    html += '<div style="margin-top:6px"><strong style="color:#58a6ff;">卡尺讀數：</strong></div>';
    for (const r of ai.ocr_readings) {
      html += `<div class="result-item"><span class="result-label">${r.location}：</span><span class="result-value">${r.value} ${r.unit}</span></div>`;
    }
  }

  // Label info
  if (ai?.label_info?.model_number) {
    html += `<div style="margin-top:6px"><strong style="color:#58a6ff;">型號：</strong> ${ai.label_info.model_number}</div>`;
    if (ai.label_info.manufacturer) {
      html += `<div class="result-item"><span class="result-label">製造商：</span><span class="result-value">${ai.label_info.manufacturer}</span></div>`;
    }
  }

  // Official specs
  if (ai?.official_specs && Object.keys(ai.official_specs).length > 0) {
    html += '<div style="margin-top:6px"><strong style="color:#58a6ff;">官方規格：</strong></div>';
    for (const [key, val] of Object.entries(ai.official_specs)) {
      html += `<div class="result-item"><span class="result-label">${key}：</span><span class="result-value">${val} mm</span></div>`;
    }
  }

  // OpenCV
  if (opencv) {
    const totalContours = opencv.reduce((sum: number, o: any) => sum + (o.contours?.length || 0), 0);
    const totalCircles = opencv.reduce((sum: number, o: any) => sum + (o.circles?.length || 0), 0);
    html += `<div style="margin-top:6px"><strong style="color:#58a6ff;">OpenCV：</strong> ${totalContours} 個輪廓, ${totalCircles} 個圓</div>`;
    if (opencv.some((o: any) => o.error)) {
      html += `<div class="result-error">OpenCV 錯誤：${opencv.find((o: any) => o.error)?.error}</div>`;
    }
  }

  if (!ai?.ocr_readings?.length && !ai?.label_info && !ai?.official_specs) {
    html += '<div style="color:#8b949e;margin-top:6px;">未偵測到數據。請確認照片中包含卡尺、標籤或尺規。</div>';
  }

  html += '</div>';
  analysisResults.innerHTML = html;
}

function showAnalysisError(err: any): void {
  analysisResults.innerHTML = `
    <div class="results-panel">
      <h4 style="color:#f85149;">分析失敗</h4>
      <div class="result-error">${err.message || err}</div>
    </div>`;
}

// ── Event Handlers ──
function setupEvents(): void {
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
    store.undo(); renderDrawings(); renderUI();
  });
  document.getElementById('redoBtn')!.addEventListener('click', () => {
    store.redo(); renderDrawings(); renderUI();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); store.undo(); renderDrawings(); renderUI(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); store.redo(); renderDrawings(); renderUI(); }
  });

  // Angle select
  angleSelect.addEventListener('change', () => {
    store.setPhotoAngle(angleSelect.value as ViewAngle);
    const photo = store.getActivePhoto();
    if (photo && store.getState().projectId) {
      api.updatePhoto(store.getState().projectId!, photo.id, { angle: angleSelect.value });
    }
  });

  // Feature/dimension delete
  featureList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.delete-btn') as HTMLElement;
    if (btn?.dataset.featId) { store.removeFeature(btn.dataset.featId); renderDrawings(); renderUI(); }
  });
  dimensionList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.delete-btn') as HTMLElement;
    if (btn?.dataset.dimId) { store.removeDimension(btn.dataset.dimId); renderUI(); }
  });

  // Add dimension
  document.getElementById('addDimBtn')!.addEventListener('click', () => {
    const locInput = document.getElementById('dimLocation') as HTMLInputElement;
    const valInput = document.getElementById('dimValue') as HTMLInputElement;
    const location = locInput.value.trim();
    const value = parseFloat(valInput.value);
    if (location && value > 0) {
      store.addDimension({ id: `dim_${Date.now()}`, location, value_mm: value, source: 'user_input' });
      locInput.value = ''; valInput.value = '';
      renderUI();
    }
  });

  // AI Analyze
  document.getElementById('analyzeBtn')!.addEventListener('click', async () => {
    const projectId = store.getState().projectId;
    if (!projectId) return alert('請先建立專案');
    showAnalysisLoading();
    try {
      const result = await api.analyzeProject(projectId);
      showAnalysisResult(result);
    } catch (err: any) {
      showAnalysisError(err);
    }
  });

  // Export JSON
  document.getElementById('exportBtn')!.addEventListener('click', async () => {
    const projectId = store.getState().projectId;
    if (!projectId) return alert('請先建立專案');
    const result = await api.exportMeasurement(projectId);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'measurement.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // Copy JSON
  document.getElementById('copyJsonBtn')!.addEventListener('click', async () => {
    const projectId = store.getState().projectId;
    if (!projectId) return alert('請先建立專案');
    const result = await api.exportMeasurement(projectId);
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    alert('JSON 已複製到剪貼簿');
  });

  // Mouse coordinate tracking
  drawingCanvas.addEventListener('pointermove', (e) => {
    const rect = drawingCanvas.getBoundingClientRect();
    const imgPt = photoLayer.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    const photo = store.getActivePhoto();
    if (photo?.scale) {
      statusCoords.textContent = `${(imgPt.x / photo.scale.px_per_mm).toFixed(1)}, ${(imgPt.y / photo.scale.px_per_mm).toFixed(1)} mm`;
    } else {
      statusCoords.textContent = `px: ${imgPt.x.toFixed(0)}, ${imgPt.y.toFixed(0)}`;
    }
  });

  // Transform changes
  drawingCanvas.addEventListener('transform-change', () => renderDrawings());

  // Window resize
  window.addEventListener('resize', resizeCanvases);
}

// ── Init ──
async function init(): Promise<void> {
  resizeCanvases();
  setupEvents();
  activateTool('select');
  renderUI();

  // Load existing project (skip garbled names)
  const projects = await api.listProjects();
  const validProject = projects.find((p) => {
    // Skip projects with garbled names (non-printable characters)
    return p.name && !/[\uFFFD]/.test(p.name) && p.name.length > 0;
  });

  if (validProject) {
    store.setProject(validProject.id, validProject.name);
    const photos = await api.listPhotos(validProject.id);
    if (photos.length > 0) {
      store.setPhotos(
        photos.map((p) => ({
          id: p.id, filename: p.filename, originalName: p.original_name,
          angle: (p.angle || 'top') as ViewAngle,
          scale: p.scale_data ? JSON.parse(p.scale_data) : null,
          drawings: [], features: [], dimensions: [],
        })),
      );
      await loadPhoto(store.getActivePhoto()!);
    }
    renderUI();
  }
}

init();
