## 1. Gemini 尺規偵測服務

- [ ] 1.1 建立 src/server/services/ruler.ts: Gemini prompt 偵測尺規刻度，回傳像素座標 + 真實距離
- [ ] 1.2 設計 prompt: 要求 JSON 回傳 {found, point_a{px_x,px_y,label}, point_b{px_x,px_y,label}, distance_mm}
- [ ] 1.3 座標驗證: 檢查回傳座標在圖片範圍內，distance > 0
- [ ] 1.4 測試: 用 L390 鍵盤照片測試偵測準確度

## 2. 上傳自動分析 Pipeline

- [ ] 2.1 建立 POST /api/projects/:id/photos/:photoId/auto-analyze SSE endpoint
- [ ] 2.2 並行觸發: [ruler detection, OpenCV contour, label OCR] 同時發出
- [ ] 2.3 SSE 事件格式: {step, status, result} 每個子任務獨立回報
- [ ] 2.4 結果存入 DB (analysis_results 表)
- [ ] 2.5 測試: SSE 連線 + 進度事件

## 3. 前端自動分析進度

- [ ] 3.1 上傳照片後自動呼叫 auto-analyze endpoint
- [ ] 3.2 EventSource 接收進度 → 顯示在 Wizard 步驟 1 下方
- [ ] 3.3 分析完成後自動推進到步驟 2

## 4. Wizard 確認比例尺（步驟 2）

- [ ] 4.1 顯示 AI 偵測結果:「偵測到尺規 {label_a}~{label_b}，建議 {px_per_mm} px/mm」
- [ ] 4.2 確認按鈕: 套用 AI 比例尺
- [ ] 4.3 手動覆蓋按鈕: 切換到手動比例尺工具
- [ ] 4.4 無尺規時: 顯示「未偵測到尺規」+ 自動切到手動模式
- [ ] 4.5 測試: 確認/覆蓋/無尺規 三種情境

## 5. Wizard 確認輪廓（步驟 3）

- [ ] 5.1 顯示 OpenCV 偵測的輪廓覆蓋在照片上（綠色線條）
- [ ] 5.2 確認按鈕: 接受 AI 輪廓
- [ ] 5.3 微調按鈕: 切換到多邊形工具讓使用者編輯
- [ ] 5.4 重繪按鈕: 清除 AI 輪廓，使用者從頭畫
- [ ] 5.5 無輪廓時: 顯示「未偵測到輪廓」+ 自動切到手動模式
- [ ] 5.6 測試: 確認/微調/重繪/無輪廓 四種情境

## 6. 右側面板簡化

- [ ] 6.1 Wizard 模式: 移除「操作流程」guide panel
- [ ] 6.2 Wizard 模式: 右側只保留拍攝角度、比例尺、特徵、尺寸、操作按鈕
- [ ] 6.3 自由模式: 保持現有 guide panel
- [ ] 6.4 測試: 兩種模式下右側面板正確顯示

## 7. Playwright E2E 驗證

- [ ] 7.1 更新 ux-audit.test.ts: 測試自動分析流程（上傳→進度→確認）
- [ ] 7.2 截圖每步驟 + Gemini agent 驗證 UI 合理性
