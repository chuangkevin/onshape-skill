## Why

AI 分析完成後，自由模式沒有下一步引導，使用者不知道該做什麼。分析結果（型號、規格、OCR）顯示在角落但無法確認或編輯。匯出前沒有視覺化預覽，使用者無法判斷輪廓是否正確就直接匯出。

## What Changes

- **自由模式操作引導**：分析完成後右側面板顯示明確的下一步按鈕（預覽 CAD、生成 FeatureScript、匯出 JSON）
- **AI 結果確認面板**：標籤/規格/OCR 讀數以可確認+可編輯的卡片顯示，使用者可勾選確認或修改數值
- **Three.js 2.5D CAD 預覽**：用輪廓 mm 座標擠出成 3D 模型，可旋轉/縮放，顯示尺寸標註
- **生成 FeatureScript**：用 measurement.json 呼叫 Gemini/Claude 生成 FeatureScript 程式碼，在 UI 顯示可複製的 code block
- **Wizard 步驟 4 改善**：顯示 AI 偵測到的標籤+規格讓使用者確認
- **Wizard 步驟 5 加入 CAD 預覽**：匯出前先看 3D 預覽

## Capabilities

### New Capabilities
- `threejs-preview`: Three.js 2.5D CAD 預覽（輪廓擠出 + 旋轉 + 尺寸標註）
- `featurescript-gen`: 從 measurement.json 生成 FeatureScript 程式碼
- `ai-results-panel`: AI 分析結果確認+編輯面板
- `free-mode-guide`: 自由模式操作引導（分析完顯示下一步）

### Modified Capabilities
- `wizard-confirm-flow`: 步驟 4 加入 AI 結果確認，步驟 5 加入 CAD 預覽
- `json-export`: 匯出前加入預覽步驟

## Impact

- Dependencies: 新增 three.js (npm)
- Client: 新增 3D 預覽 Canvas、結果面板元件、FeatureScript 顯示
- Server: 新增 FeatureScript 生成 endpoint（呼叫 Gemini）
