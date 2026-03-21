## 開發規範

> 每個 Phase 必須遵守以下流程：
> 1. **規劃 E2E 測試** — 先寫測試案例描述，再開始實作
> 2. **實作功能** — 按 task 逐一完成
> 3. **執行 E2E 測試** — 使用 Playwright `--headed` 模式（開啟瀏覽器讓使用者看到）
> 4. **Commit + Push** — 測試通過後立即 commit 並 push

---

## Phase 1: AI 結果確認面板

- [ ] 1.1 index.html 右側面板新增 #aiResultsPanel 區域 + CSS
- [ ] 1.2 main.ts：分析完成後渲染結果卡片（型號/製造商/規格/OCR）
- [ ] 1.3 確認勾選：每項有 checkbox，勾選後標記為已確認
- [ ] 1.4 編輯功能：點擊數值 → 變成 input → blur 儲存
- [ ] 1.5 確認的資料帶入 export
- [ ] 1.6 E2E: Playwright 驗證分析後面板出現 + 勾選 + 編輯 + export 包含確認項目
- [ ] 1.7 Commit + Push

## Phase 2: Three.js 2.5D CAD 預覽

- [ ] 2.1 npm install three @types/three
- [ ] 2.2 建立 src/client/preview/CadPreview.ts：Three.js 場景（相機、光源、OrbitControls）
- [ ] 2.3 contour_mm → THREE.Shape → ExtrudeGeometry（厚度從 caliper_readings 取）
- [ ] 2.4 circle features → Shape.holes 挖孔
- [ ] 2.5 材質：半透明灰 + 線框 overlay
- [ ] 2.6 尺寸標註：CSS2DRenderer 顯示長/寬/高
- [ ] 2.7 預覽 modal UI：全螢幕 overlay + 關閉按鈕
- [ ] 2.8 E2E: Playwright 驗證預覽 modal 開啟 + Three.js canvas 渲染 + 關閉
- [ ] 2.9 Commit + Push

## Phase 3: FeatureScript 生成

- [ ] 3.1 建立 POST /api/generate-featurescript endpoint
- [ ] 3.2 Gemini prompt：帶入 measurement.json + onshape-skill SKILL.md 的規則
- [ ] 3.3 前端 modal 顯示生成的 code block + 複製按鈕
- [ ] 3.4 E2E: Playwright 驗證生成按鈕 → API 呼叫 → code block 顯示
- [ ] 3.5 Commit + Push

## Phase 4: 自由模式引導 + Wizard 改善

- [ ] 4.1 分析完成後在右側「操作」區域上方顯示「下一步」按鈕組
- [ ] 4.2 「預覽 CAD 模型」按鈕 → 開啟 Three.js 預覽 modal
- [ ] 4.3 「生成 FeatureScript」按鈕 → 呼叫 API 生成程式碼
- [ ] 4.4 按鈕狀態感知：無輪廓時禁用預覽，無分析時禁用生成
- [ ] 4.5 Wizard 步驟 4：顯示 AI 結果確認面板
- [ ] 4.6 Wizard 步驟 5：加入「預覽 CAD」+「生成 FeatureScript」按鈕
- [ ] 4.7 E2E: Playwright 完整流程（Free + Wizard 模式）
- [ ] 4.8 Commit + Push
