## Context

Photo Measurement Tool 已有完整的後端（Express + SQLite + Gemini API pool + OpenCV）和前端（Canvas 雙層 + 繪圖工具），但使用者在操作流程上迷失。工具將部署在 RPi 4 Docker（ARM Cortex-A72, 4核 1.5GHz, 4-8GB RAM），Gemini 是網路 bound，OpenCV 是 CPU bound。

## Goals / Non-Goals

**Goals:**
- 修復 Python + OpenCV 在所有環境（Windows dev、Linux Docker）可靠運作
- 引導模式讓新手一步步完成，自由模式讓熟手快速操作
- AI 分析有即時進度回饋（SSE），使用者知道系統在做什麼
- 多照片作為同一零件的不同 Views 綁定
- RPi 4 上 OpenCV 不超過 3 秒

**Non-Goals:**
- 不做 WebSocket（SSE 更輕量，足夠）
- 不做 3D 重建
- 不改 DB schema（現有 schema 已足夠）
- 不做使用者認證（單機工具）

## Decisions

### 1. Python 路徑：啟動時偵測 + 環境變數覆蓋

**Choice**: 啟動時依序嘗試 `PYTHON_PATH` 環境變數 → `where python` (Win) / `which python3` (Linux) → 常見固定路徑。快取結果。

**Docker**: Dockerfile 安裝 Python 到已知路徑，設定 `PYTHON_PATH=/usr/bin/python3`。

### 2. 雙模式：Wizard overlay + 工具列共存

```
引導模式                                自由模式
═══════                                ═══════
┌─────────────────────────────┐       ┌─────────────────────────────┐
│ 步驟 2/5：校準比例尺         │       │ [選取][多邊形][弧線][圓孔]   │
│                             │       │ [比例尺] | [復原][重做]      │
│ 在照片中的尺規上            │       │                             │
│ 點擊兩個刻度點              │       │ (右側 guide 可折疊)          │
│                             │       │                             │
│ ← 第一個點位置會有動畫箭頭   │       │                             │
│                             │       │                             │
│     [上一步] [跳過] [下一步] │       │                             │
└─────────────────────────────┘       └─────────────────────────────┘
```

**實作**: Wizard 是一個 overlay div，覆蓋在工具列上方。內部仍然呼叫同樣的 `activateTool()`，只是 UI 表現不同。切換模式只是隱藏/顯示 wizard overlay + 工具列。

**偏好記憶**: `localStorage.setItem('measureMode', 'wizard' | 'free')`

### 3. SSE 即時分析

**Choice**: Express route `GET /api/projects/:id/analyze-stream` 回傳 `text/event-stream`。

```
Pipeline 拆分為獨立步驟：
  1. ocr       → Gemini OCR（可並行）
  2. labels    → Gemini 標籤辨識（可並行）
  3. search    → Gemini WebSearch（依賴 labels）
  4. opencv    → Python edge detect（可並行）
  5. fusion    → 合併結果（依賴全部）

並行群組：
  [ocr, labels, opencv] → 同時發出
  [search]              → 等 labels 完成
  [fusion]              → 等全部完成
```

前端用 `EventSource` 接收，每個 step event 更新進度面板。

### 4. 多照片 Views

**Choice**: 不改 DB，利用現有 `photos.angle` 欄位區分 Views。前端 UI 改為用 tab 或 icon 顯示每個 view 的角度。比例尺存在 `photos.scale_data`，新增「套用到所有照片」按鈕。

### 5. RPi 4 OpenCV 最佳化

**Choice**: `edge_detect.py` 在處理前先 `cv2.resize()` 到最長邊 1024px。原始座標用比例換算回來。

## Risks / Trade-offs

**[Wizard 模式增加維護成本]** → Mitigation: Wizard 內部呼叫同樣的 tool activation API，只是 UI wrapper。核心邏輯不重複。

**[SSE 連線在 RPi 4 長時間開著]** → Mitigation: 設定 30 秒 timeout。Pipeline 通常 15-20 秒完成。

**[Python 完整路徑在不同系統不同]** → Mitigation: 多重 fallback + 環境變數覆蓋 + 啟動時明確日誌輸出。
