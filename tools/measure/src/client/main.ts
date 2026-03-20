import { PhotoLayer } from './canvas/PhotoLayer.js';
import { DrawingLayer } from './canvas/DrawingLayer.js';
import { store, type ToolType, type PhotoState } from './state/store.js';
import { activatePolylineTool, isDrawingInProgress } from './tools/PolylineTool.js';
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

// ── Landing Page DOM Elements ──
const projectLanding = document.getElementById('projectLanding') as HTMLDivElement;
const projectGrid = document.getElementById('projectGrid') as HTMLDivElement;
const newProjectBtn = document.getElementById('newProjectBtn') as HTMLButtonElement;
const backToLanding = document.getElementById('backToLanding') as HTMLButtonElement;
const sidebarProjectName = document.getElementById('sidebarProjectName') as HTMLSpanElement;

// ── Mode & Wizard DOM Elements ──
const modeSelector = document.getElementById('modeSelector') as HTMLDivElement;
const modeToggleBtn = document.getElementById('modeToggle') as HTMLButtonElement;
const rememberModeCheckbox = document.getElementById('rememberMode') as HTMLInputElement;
const wizardOverlay = document.getElementById('wizardOverlay') as HTMLDivElement;
const wizardBody = document.getElementById('wizardBody') as HTMLDivElement;
const wizPrevBtn = document.getElementById('wizPrev') as HTMLButtonElement;
const wizSkipBtn = document.getElementById('wizSkip') as HTMLButtonElement;
const wizNextBtn = document.getElementById('wizNext') as HTMLButtonElement;

// ── Mode & Wizard State ──
let currentMode: 'wizard' | 'free' = 'free';
let wizardStep = 1;
let wizardReady = false; // Don't auto-advance during init loading

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

// Auto-advance when state changes + sync scale to DB
let _lastScaleJson = '';
store.subscribe(() => {
  autoAdvance();
  // Wizard auto-advance: only advance the CURRENT step, never skip
  const photo = store.getActivePhoto();
  const state = store.getState();
  if (wizardStep === 1 && state.photos.length > 0) {
    // Don't auto-advance step 1 here — wait for SSE analysis to complete
  }
  // Only auto-advance step 2 when user manually sets scale (not during SSE)
  // Step 3: just refresh display when drawings change (user must click confirm)

  // Sync scale to DB whenever it changes
  if (photo?.scale && state.projectId) {
    const scaleJson = JSON.stringify(photo.scale);
    if (scaleJson !== _lastScaleJson) {
      _lastScaleJson = scaleJson;
      api.updatePhoto(state.projectId, photo.id, { scale_data: scaleJson });
    }
  }
});

// ── Tool Management ──
let cleanupTool: (() => void) | null = null;
let hasUnsavedDrawing = false; // Track if user is mid-drawing

function setUnsavedDrawing(v: boolean): void { hasUnsavedDrawing = v; }

function activateTool(tool: ToolType, force = false): void {
  // Confirm if user has unsaved in-progress drawing
  if (!force && (hasUnsavedDrawing || isDrawingInProgress)) {
    if (!confirm('目前有未完成的繪製，確定要切換工具嗎？')) return;
  }
  hasUnsavedDrawing = false;

  if (cleanupTool) cleanupTool();

  switch (tool) {
    case 'select':
      cleanupTool = activateSelectTool(drawingCanvas, photoLayer, renderDrawings);
      break;
    case 'polyline':
      cleanupTool = activatePolylineTool(drawingCanvas, photoLayer, drawingLayer, renderDrawingsAndTrack);
      break;
    case 'arc':
      cleanupTool = activateArcTool(drawingCanvas, photoLayer, drawingLayer, renderDrawingsAndTrack);
      break;
    case 'hole':
      cleanupTool = activateHoleTool(drawingCanvas, photoLayer, drawingLayer, renderDrawingsAndTrack);
      break;
    case 'scale':
      cleanupTool = activateScaleTool(drawingCanvas, photoLayer, drawingLayer, renderDrawingsAndTrack);
      break;
  }

  store.setActiveTool(tool);
  showToolHint(tool);
}

/** Wrapper that also updates guide after drawing changes */
function renderDrawingsAndTrack(): void {
  renderDrawings();
  renderUI();
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

// ── Angle icons ──
const ANGLE_ICONS: Record<string, string> = {
  top: '⬆', side: '➡', front: '⬇', back: '⬅', 'close-up': '🔍',
};

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

  // After scale calibration → ask to apply to all, then auto-detect contour then switch to polyline
  if (step === 3 && currentTool === 'scale' && photo?.scale) {
    setTimeout(async () => {
      // Ask user whether to apply scale to all photos in this project
      const projectId = store.getState().projectId;
      if (projectId && store.getState().photos.length > 1 && photo.scale) {
        if (confirm('是否將此比例尺套用到同專案的所有照片？')) {
          try {
            const result = await api.applyScaleToAll(projectId, photo.scale);
            // Update local state for all photos
            const photos = store.getState().photos.map((p) => ({
              ...p,
              scale: photo.scale,
            }));
            store.setPhotos(photos);
            toolHint.textContent = `比例尺已套用到 ${result.updated} 張照片`;
            toolHint.classList.remove('hidden');
          } catch (err) {
            console.warn('Apply scale to all failed:', err);
          }
        }
      }

      showToolHint('scale'); // Update hint
      toolHint.textContent = '比例尺已校準！正在自動偵測輪廓...';
      toolHint.classList.remove('hidden');

      // Try auto-contour detection
      await tryAutoContour();

      activateTool('polyline', true);
      renderUI();
    }, 300);
  }
}

/** Try to auto-detect contour using OpenCV and add as initial drawing */
async function tryAutoContour(): Promise<void> {
  const state = store.getState();
  const photo = store.getActivePhoto();
  if (!state.projectId || !photo) return;

  try {
    const result = await api.autoContour(state.projectId, photo.id);

    if (result.contours && result.contours.length > 0) {
      // Take the largest contour
      const largest = result.contours[0];
      if (largest.contour_px && largest.contour_px.length >= 3) {
        const shape = {
          type: 'polyline' as const,
          id: `auto_${Date.now()}`,
          points_px: largest.contour_px,
          closed: true,
        };
        store.addDrawing(shape);
        toolHint.textContent = `自動偵測到輪廓（${largest.contour_px.length} 點），可用選取工具微調`;
        renderDrawings();
        return;
      }
    }

    // No contour found
    toolHint.textContent = '未偵測到輪廓，請手動描繪邊緣';
  } catch (err) {
    console.warn('Auto-contour failed:', err);
    toolHint.textContent = '自動偵測失敗，請手動描繪邊緣';
  }
}

// ── Auto-Analysis (SSE) ──
let autoAnalysisResults: any = null;

function startAutoAnalysis(projectId: number, photoId: number): void {
  autoAnalysisResults = null;

  const es = new EventSource(`/api/projects/${projectId}/photos/${photoId}/auto-analyze`);

  // Update wizard body with progress
  const updateProgress = (data: any) => {
    if (currentMode !== 'wizard') return;
    const statusIcons: Record<string, string> = { running: '⏳', done: '✅', error: '❌' };
    const stepNames: Record<string, string> = { ruler: '尺規偵測', contour: '輪廓偵測', labels: '標籤辨識' };

    // Build progress HTML
    let html = '<div style="text-align:left;display:inline-block;">';
    for (const [key, name] of Object.entries(stepNames)) {
      const status = (data._statuses?.[key]) || 'waiting';
      const icon = statusIcons[status] || '⏳';
      html += `<div>${icon} ${name}</div>`;
    }
    html += '</div>';

    const body = document.getElementById('wizardBody');
    if (body && wizardStep === 1) {
      body.innerHTML = `<p>AI 正在分析照片...</p>${html}`;
    }
  };

  const statuses: Record<string, string> = {};

  es.addEventListener('step', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    statuses[data.step] = data.status;

    if (data.step === 'ruler' && data.status === 'done') {
      autoAnalysisResults = { ...autoAnalysisResults, ruler: data.result };
      // Auto-set scale in store when ruler found
      if (data.result?.found) {
        const r = data.result;
        store.setScale({
          pointA_px: { x: r.point_a.px_x, y: r.point_a.px_y },
          pointB_px: { x: r.point_b.px_x, y: r.point_b.px_y },
          distance_mm: r.distance_mm,
          px_per_mm: r.px_per_mm,
        });
      }
    }
    if (data.step === 'contour' && data.status === 'done') {
      autoAnalysisResults = { ...autoAnalysisResults, contour: data.result };
      // Auto-add largest contour as drawing
      if (data.result?.contours?.length > 0) {
        const largest = data.result.contours[0];
        if (largest.contour_px?.length >= 3) {
          store.addDrawing({
            type: 'polyline',
            id: 'auto_contour',
            points_px: largest.contour_px,
            closed: true,
          });
        }
      }
    }
    if (data.step === 'labels' && data.status === 'done') {
      autoAnalysisResults = { ...autoAnalysisResults, labels: data.result };
    }

    if (data.step === 'complete' && data.status === 'done') {
      es.close();
      autoAnalysisResults = { ...autoAnalysisResults, ...data.result };

      // Auto-advance wizard to step 2
      if (currentMode === 'wizard' && wizardStep === 1) {
        wizardStep = 2;
        updateWizard();
      }
      return;
    }

    updateProgress({ _statuses: statuses });
  });

  es.onerror = () => {
    es.close();
    // Show error, don't auto-advance
    if (currentMode === 'wizard' && wizardStep === 1) {
      const body = document.getElementById('wizardBody');
      if (body) {
        body.innerHTML = `
          <p style="color:#f85149;">AI 自動分析連線失敗</p>
          <p style="color:#8b949e;margin-top:4px;">請點擊「下一步」手動操作，或重新上傳照片</p>`;
      }
    }
  };
}

// ── Landing Page Logic ──
async function showLanding(): Promise<void> {
  projectLanding.classList.remove('hidden');
  // Hide workspace elements
  const mainEl = document.querySelector('.main') as HTMLElement;
  if (mainEl) mainEl.style.display = 'none';

  // Fetch and render project list
  const projects = await api.listProjects();

  if (projects.length === 0) {
    projectGrid.innerHTML = '<p style="text-align:center;color:#8b949e;grid-column:1/-1;">尚無專案，點擊上方「+ 新建專案」開始</p>';
    return;
  }

  projectGrid.innerHTML = projects.map(p => `
    <div class="project-card" data-project-id="${p.id}">
      <h3>${p.name}</h3>
      <div class="card-meta">${new Date(p.created_at).toLocaleDateString('zh-TW')}</div>
      <div class="card-actions">
        <button type="button" class="card-btn" data-action="open" data-id="${p.id}">開啟</button>
        <button type="button" class="card-btn danger" data-action="delete" data-id="${p.id}">刪除</button>
      </div>
    </div>
  `).join('');
}

async function openProject(projectId: number): Promise<void> {
  const projects = await api.listProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  store.setProject(project.id, project.name);

  const photos = await api.listPhotos(project.id);
  if (photos.length > 0) {
    store.setPhotos(photos.map(p => ({
      id: p.id, filename: p.filename, originalName: p.original_name,
      angle: (p.angle || 'top') as ViewAngle,
      scale: p.scale_data ? JSON.parse(p.scale_data) : null,
      drawings: [], features: [], dimensions: [],
    })));
    await loadPhoto(store.getActivePhoto()!);
  } else {
    store.setPhotos([]);
  }

  // Hide landing, show workspace
  projectLanding.classList.add('hidden');
  const mainEl = document.querySelector('.main') as HTMLElement;
  if (mainEl) mainEl.style.display = '';

  sidebarProjectName.textContent = project.name;
  renderUI();

  // Apply saved mode or show mode selector
  const savedMode = localStorage.getItem('measureMode') as 'wizard' | 'free' | null;
  if (savedMode) {
    applyMode(savedMode);
    // Set wizard step based on current state (for returning users)
    if (savedMode === 'wizard') {
      const photo = store.getActivePhoto();
      if (!store.getState().photos.length) wizardStep = 1;
      else if (!photo?.scale) wizardStep = 2;
      else if (!photo.drawings.length) wizardStep = 3;
      else wizardStep = 4;
      updateWizard();
    }
  } else {
    showModeSelector();
  }
}

function hideLanding(): void {
  projectLanding.classList.add('hidden');
  const mainEl = document.querySelector('.main') as HTMLElement;
  if (mainEl) mainEl.style.display = '';
}

function renderUI(): void {
  const state = store.getState();
  const photo = store.getActivePhoto();

  // Project name
  projectNameEl.textContent = state.projectName || '尚無專案';
  sidebarProjectName.textContent = state.projectName || '';

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
      <span>${ANGLE_ICONS[p.angle] || '⬆'} ${p.originalName}</span>
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

  // Keep wizard in sync with current mode
  if (currentMode === 'wizard') {
    wizardOverlay.classList.remove('hidden');
  } else {
    wizardOverlay.classList.add('hidden');
  }
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
    hideLanding();
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

  // In wizard mode: start auto-analysis; in free mode: switch to scale tool
  const photo = store.getActivePhoto();
  if (currentMode === 'wizard' && photo && store.getState().projectId) {
    startAutoAnalysis(store.getState().projectId!, photo.id);
  } else {
    setTimeout(() => {
      activateTool('scale');
      renderUI();
    }, 500);
  }
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

    const btn = document.getElementById('analyzeBtn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'AI 分析中...';
    showAnalysisLoading();

    try {
      const result = await api.analyzeProject(projectId);
      showAnalysisResult(result);
    } catch (err: any) {
      showAnalysisError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI 分析';
    }
  });

  // Export JSON
  document.getElementById('exportBtn')!.addEventListener('click', async () => {
    const state = store.getState();
    if (!state.projectId) return alert('請先建立專案');
    const result = await api.exportMeasurement(state.projectId, undefined, state.photos);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'measurement.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // Copy JSON
  document.getElementById('copyJsonBtn')!.addEventListener('click', async () => {
    const state = store.getState();
    if (!state.projectId) return alert('請先建立專案');
    const result = await api.exportMeasurement(state.projectId, undefined, state.photos);
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

  // ── Landing Page Events ──
  // New project button
  newProjectBtn.addEventListener('click', async () => {
    const name = prompt('請輸入專案名稱：');
    if (!name) return;
    const project = await api.createProject(name);
    await openProject(project.id);
  });

  // Project grid clicks (event delegation)
  projectGrid.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
    if (!btn) {
      // Click on card itself
      const card = (e.target as HTMLElement).closest('.project-card') as HTMLElement;
      if (card) await openProject(parseInt(card.dataset.projectId!));
      return;
    }

    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id!);

    if (action === 'open') {
      await openProject(id);
    } else if (action === 'delete') {
      if (confirm('確定要刪除此專案？所有照片和資料將被永久刪除。')) {
        await api.deleteProject(id);
        await showLanding(); // Refresh list
      }
    }
  });

  // Back to landing
  backToLanding.addEventListener('click', () => {
    showLanding();
  });
}

// ── Mode Selector Logic ──
function applyMode(mode: 'wizard' | 'free'): void {
  currentMode = mode;
  modeSelector.classList.add('hidden');

  // Hide guide section in wizard mode (Tasks 6.1-6.3)
  const guideSection = document.getElementById('guideSection');
  if (guideSection) {
    guideSection.style.display = mode === 'wizard' ? 'none' : '';
  }

  if (mode === 'wizard') {
    wizardOverlay.classList.remove('hidden');
    modeToggleBtn.textContent = '切換至自由模式';
    updateWizard();
  } else {
    wizardOverlay.classList.add('hidden');
    modeToggleBtn.textContent = '切換至引導模式';
  }
}

function showModeSelector(): void {
  modeSelector.classList.remove('hidden');
}

function setupModeEvents(): void {
  // Mode card clicks
  document.querySelectorAll('.mode-card').forEach((card) => {
    card.addEventListener('click', () => {
      const mode = (card as HTMLElement).dataset.mode as 'wizard' | 'free';
      localStorage.setItem('measureMode', mode); // Always remember
      applyMode(mode);
    });
  });

  // Mode toggle button in header
  modeToggleBtn.addEventListener('click', () => {
    const newMode = currentMode === 'wizard' ? 'free' : 'wizard';
    const saved = localStorage.getItem('measureMode');
    if (saved) {
      localStorage.setItem('measureMode', newMode);
    }
    applyMode(newMode);
  });
}

// ── Wizard Logic ──
const WIZARD_INSTRUCTIONS: Record<number, string> = {
  1: '拖曳照片到下方區域，上傳後自動開始 AI 分析...',
  2: 'AI 偵測到的比例尺如下，請確認或手動覆蓋',
  3: 'AI 偵測到的輪廓如下，請確認、微調或重繪',
  4: '（選填）補充圓孔等特徵，或輸入卡尺尺寸',
  5: '確認無誤後，點擊匯出 JSON',
};

function updateWizard(): void {
  if (currentMode !== 'wizard') return;

  // Update step highlights
  document.querySelectorAll('.wiz-step').forEach((el) => {
    const step = parseInt((el as HTMLElement).dataset.wstep || '0');
    el.classList.remove('active', 'done');
    if (step < wizardStep) el.classList.add('done');
    else if (step === wizardStep) el.classList.add('active');
  });

  // Update body content per step
  let bodyHtml = `<p>${WIZARD_INSTRUCTIONS[wizardStep]}</p>`;

  if (wizardStep === 2) {
    const photo = store.getActivePhoto();
    if (photo?.scale) {
      // Scale already set (from auto-analysis or manual)
      bodyHtml = `<p>比例尺已設定：<strong>${photo.scale.px_per_mm.toFixed(2)} px/mm</strong>（參考距離 ${photo.scale.distance_mm}mm）</p>
        <div style="margin-top:12px;">
          <button type="button" class="tool-btn primary" id="wizConfirmScale">確認使用</button>
          <button type="button" class="tool-btn" id="wizManualScale">重新校準</button>
        </div>`;
    } else {
      const ruler = autoAnalysisResults?.ruler;
      if (ruler?.found) {
        bodyHtml = `
          <p>偵測到尺規：<strong>${ruler.point_a.label} ~ ${ruler.point_b.label}</strong></p>
          <p>建議比例尺：<strong>${ruler.px_per_mm.toFixed(2)} px/mm</strong></p>
          <div style="margin-top:12px;">
            <button type="button" class="tool-btn primary" id="wizConfirmScale">確認使用</button>
            <button type="button" class="tool-btn" id="wizManualScale">手動校準</button>
          </div>`;
      } else {
        bodyHtml = `
          <p>未偵測到尺規，請手動校準比例尺</p>
          <p style="color:#8b949e;">在照片中的尺規上點擊兩個刻度點</p>`;
        activateTool('scale', true);
      }
    }
  } else if (wizardStep === 3) {
    const photo = store.getActivePhoto();
    const existingDrawings = photo?.drawings || [];

    if (existingDrawings.length > 0) {
      // Drawings already exist in store (from SSE auto-add or manual)
      renderDrawings();
      bodyHtml = `
        <p>已有 ${existingDrawings.length} 個輪廓</p>
        <div style="margin-top:12px;">
          <button type="button" class="tool-btn primary" id="wizConfirmContour">確認輪廓</button>
          <button type="button" class="tool-btn" id="wizEditContour">微調</button>
          <button type="button" class="tool-btn" id="wizRedrawContour">重繪</button>
        </div>`;
    } else {
      const contour = autoAnalysisResults?.contour;
      const hasContour = contour?.contours?.length > 0;

      if (hasContour) {
        // Show AI contour on canvas
        const largest = contour.contours[0];
        const points = largest.contour_px;
        if (points.length >= 3) {
          store.addDrawing({
            type: 'polyline',
            id: 'auto_contour',
            points_px: points,
            closed: true,
          });
          renderDrawings();
        }

        bodyHtml = `
          <p>偵測到 ${points.length} 點輪廓（綠色線條）</p>
          <div style="margin-top:12px;">
            <button type="button" class="tool-btn primary" id="wizConfirmContour">確認輪廓</button>
            <button type="button" class="tool-btn" id="wizEditContour">微調</button>
            <button type="button" class="tool-btn" id="wizRedrawContour">重繪</button>
          </div>`;
      } else {
        bodyHtml = `
          <p>未偵測到輪廓，請手動描繪</p>
          <p style="color:#8b949e;">沿零件邊緣逐點點擊，按 Enter 結束</p>`;
        activateTool('polyline', true);
      }
    }
  } else if (wizardStep === 5) {
    bodyHtml = `
      <p>確認無誤後，點擊匯出</p>
      <div style="margin-top:12px;">
        <button type="button" class="tool-btn primary" id="wizExportBtn">匯出 JSON</button>
        <button type="button" class="tool-btn" id="wizCopyBtn">複製 JSON</button>
      </div>`;
  }

  wizardBody.innerHTML = bodyHtml;

  // Wire up step-specific buttons after innerHTML is set
  if (wizardStep === 2) {
    document.getElementById('wizConfirmScale')?.addEventListener('click', () => {
      const photo = store.getActivePhoto();
      if (photo?.scale) {
        // Scale already in store (from SSE auto-set or manual), just advance
        wizardStep = 3;
        updateWizard();
        renderUI();
      } else {
        const ruler = autoAnalysisResults?.ruler;
        if (ruler?.found) {
          store.setScale({
            pointA_px: { x: ruler.point_a.px_x, y: ruler.point_a.px_y },
            pointB_px: { x: ruler.point_b.px_x, y: ruler.point_b.px_y },
            distance_mm: ruler.distance_mm,
            px_per_mm: ruler.px_per_mm,
          });
          // DB sync happens via store.subscribe
          wizardStep = 3;
          updateWizard();
          renderUI();
        }
      }
    });
    document.getElementById('wizManualScale')?.addEventListener('click', () => {
      activateTool('scale', true);
    });
  } else if (wizardStep === 3) {
    document.getElementById('wizConfirmContour')?.addEventListener('click', () => {
      wizardStep = 4;
      updateWizard();
      renderUI();
    });
    document.getElementById('wizEditContour')?.addEventListener('click', () => {
      activateTool('polyline', true);
    });
    document.getElementById('wizRedrawContour')?.addEventListener('click', () => {
      store.removeDrawing('auto_contour');
      renderDrawings();
      activateTool('polyline', true);
    });
  } else if (wizardStep === 5) {
    document.getElementById('wizExportBtn')?.addEventListener('click', () => {
      document.getElementById('exportBtn')!.click();
    });
    document.getElementById('wizCopyBtn')?.addEventListener('click', () => {
      document.getElementById('copyJsonBtn')!.click();
    });
  }

  // Update nav button states
  wizPrevBtn.disabled = wizardStep <= 1;
  wizPrevBtn.style.opacity = wizardStep <= 1 ? '0.4' : '1';
}

function wizardAdvanceWithCheck(): void {
  const photo = store.getActivePhoto();
  const state = store.getState();

  // Validate current step completion
  if (wizardStep === 1 && state.photos.length === 0) {
    alert('請先上傳至少一張照片');
    return;
  }
  if (wizardStep === 2 && !photo?.scale) {
    alert('請先完成比例尺校準');
    return;
  }
  if (wizardStep === 3 && (!photo || photo.drawings.length === 0)) {
    alert('請先描繪至少一個輪廓');
    return;
  }

  if (wizardStep < 5) {
    wizardStep++;
    updateWizard();
  }
}

function showWizardCheckmark(): void {
  // Show brief green checkmark animation on the current step element
  const stepEl = document.querySelector(`.wiz-step[data-wstep="${wizardStep}"]`);
  if (stepEl) {
    const check = document.createElement('span');
    check.className = 'wiz-check-anim';
    check.textContent = '\u2714';
    stepEl.appendChild(check);
    setTimeout(() => check.remove(), 800);
  }
}

/** Called when a wizard-relevant action completes (photo upload, scale set, contour drawn) */
function wizardAutoAdvance(completedStep: number): void {
  if (currentMode !== 'wizard') return;
  if (!wizardReady) return; // Don't auto-advance during init
  if (wizardStep !== completedStep) return;

  showWizardCheckmark();
  setTimeout(() => {
    if (wizardStep < 5) {
      wizardStep++;
      updateWizard();
    }
  }, 600);
}

function setupWizardEvents(): void {
  wizPrevBtn.addEventListener('click', () => {
    if (wizardStep > 1) {
      wizardStep--;
      updateWizard();
    }
  });

  wizSkipBtn.addEventListener('click', () => {
    if (wizardStep < 5) {
      wizardStep++;
      updateWizard();
    }
  });

  wizNextBtn.addEventListener('click', () => {
    wizardAdvanceWithCheck();
  });
}

// ── Init ──
async function init(): Promise<void> {
  resizeCanvases();
  setupEvents();
  setupModeEvents();
  setupWizardEvents();
  activateTool('select');
  renderUI();

  // Show project landing page
  await showLanding();

  // Now wizard is ready to auto-advance from user actions (not init data)
  wizardReady = true;
}

init();
