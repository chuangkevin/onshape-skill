## Context

Photo Measurement Tool 已能自動偵測尺規+輪廓+標籤，但分析完成後 UX 斷裂：自由模式沒有下一步、Wizard 步驟 4 只有手動輸入、沒有 CAD 預覽。

## Goals / Non-Goals

**Goals:**
- 分析完成後明確引導使用者下一步
- AI 結果（標籤、規格、OCR）可確認/編輯
- Three.js 輪廓擠出預覽（旋轉/縮放）
- 一鍵生成 FeatureScript

**Non-Goals:**
- 不做完整 CAD 編輯（那是 Onshape 的事）
- 不做 STL/STEP 匯出
- 不做 Boolean 運算預覽

## Decisions

### 1. Three.js 預覽：輪廓擠出

用 `THREE.ExtrudeGeometry` 把 mm 座標的 2D 輪廓擠出成 3D：
- 輪廓 → `THREE.Shape` (從 contour_mm 點建立)
- 擠出厚度 = caliper_readings 裡的「厚度」或預設 5mm
- 材質：半透明灰色 + 線框
- 孔位：用 `Shape.holes` 挖掉 circle features
- 相機：OrbitControls 旋轉/縮放
- 尺寸標註：用 CSS2DRenderer 疊加文字

Preview 放在一個 modal 或 Wizard 步驟 5 的 body 區域。

### 2. AI 結果確認面板

分析完成後，右側面板「操作」區域上方新增結果卡片：
```
┌─ AI 分析結果 ──────────────────┐
│ 型號: L17C3P53         [✓][✎] │
│ 製造商: Lenovo          [✓]    │
│ 官方規格:                      │
│   長: 291.3mm    [✓][✎]       │
│   寬: 81.45mm    [✓][✎]       │
│   高: 6.7mm      [✓][✎]       │
│ OCR 讀數:                      │
│   厚度: 6.5mm    [✓][✎]       │
│   寬度: 27.8mm   [✓][✎]       │
└────────────────────────────────┘
```
確認(✓)的項目會被帶入 export。可編輯(✎)的項目點擊後變成 input。

### 3. 自由模式下一步引導

分析完成後，在操作區域最上方顯示：
```
┌─ 下一步 ───────────────────────┐
│ [>>> 預覽 CAD 模型]            │
│ [>>> 生成 FeatureScript]       │
│ [    匯出 JSON]                │
│ [    複製 JSON]                │
└────────────────────────────────┘
```

### 4. FeatureScript 生成

POST /api/generate-featurescript
- Body: measurement.json
- Server 用 Gemini 呼叫，帶上 onshape-skill 的 SKILL.md prompt
- 回傳 FeatureScript 程式碼
- 前端用 `<pre><code>` 顯示 + 複製按鈕

### 5. npm 依賴

- `three` (Three.js core)
- `@types/three` (TypeScript types)
- 不需要額外 bundler 設定（Vite 支援 import three）

## Risks / Trade-offs

- Three.js bundle 約 500KB — 可接受
- Gemini 生成的 FeatureScript 可能不完美 — 使用者需要在 Onshape 裡微調
- OrbitControls 的觸控事件可能和 Canvas 繪圖衝突 — 預覽用獨立 modal
