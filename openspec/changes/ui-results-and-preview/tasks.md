## 1. Three.js 2.5D CAD 預覽

- [ ] 1.1 npm install three @types/three
- [ ] 1.2 建立 src/client/preview/CadPreview.ts：Three.js 場景（相機、光源、OrbitControls）
- [ ] 1.3 contour_mm → THREE.Shape → ExtrudeGeometry（厚度從 caliper_readings 取）
- [ ] 1.4 circle features → Shape.holes 挖孔
- [ ] 1.5 材質：半透明灰 + 線框 overlay
- [ ] 1.6 尺寸標註：CSS2DRenderer 顯示長/寬/高
- [ ] 1.7 預覽 modal UI：全螢幕 overlay + 關閉按鈕
- [ ] 1.8 測試：用 battery measurement.json 驗證預覽

## 2. AI 結果確認面板

- [ ] 2.1 index.html 右側面板新增 #aiResultsPanel 區域
- [ ] 2.2 main.ts：分析完成後渲染結果卡片（型號/製造商/規格/OCR）
- [ ] 2.3 確認勾選：每項有 checkbox，勾選後標記為已確認
- [ ] 2.4 編輯功能：點擊數值 → 變成 input → blur 儲存
- [ ] 2.5 確認的資料帶入 export

## 3. 自由模式引導

- [ ] 3.1 分析完成後在右側「操作」區域上方顯示「下一步」按鈕組
- [ ] 3.2 「預覽 CAD 模型」按鈕 → 開啟 Three.js 預覽 modal
- [ ] 3.3 「生成 FeatureScript」按鈕 → 呼叫 API 生成程式碼
- [ ] 3.4 按鈕狀態感知：無輪廓時禁用預覽，無分析時禁用生成

## 4. FeatureScript 生成

- [ ] 4.1 建立 POST /api/generate-featurescript endpoint
- [ ] 4.2 Gemini prompt：帶入 measurement.json + onshape-skill SKILL.md 的規則
- [ ] 4.3 前端 modal 顯示生成的 code block + 複製按鈕 + 語法高亮
- [ ] 4.4 測試：用 battery 資料生成 FeatureScript

## 5. Wizard 步驟改善

- [ ] 5.1 步驟 4：顯示 AI 結果確認面板（同需求 2）
- [ ] 5.2 步驟 5：加入「預覽 CAD」按鈕 + Three.js 預覽
- [ ] 5.3 步驟 5：加入「生成 FeatureScript」按鈕

## 6. E2E 驗證

- [ ] 6.1 Playwright：完整流程含 CAD 預覽 + FeatureScript 生成
