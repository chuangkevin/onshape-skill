## 1. Gemini 多邊形輪廓偵測

- [x] 1.1 新增 `src/server/services/contour.ts`，實作 `detectContourWithGemini()` 函數
- [x] 1.2 設計 Gemini prompt：偵測主要物件輪廓，排除尺規/背景，回傳像素座標點陣列
- [x] 1.3 解析 Gemini 回傳的 JSON，驗證座標格式，轉換為 `contour_px` 格式
- [x] 1.4 處理多物件場景：按面積排序，最大物件排第一
- [x] 1.5 錯誤處理：API 錯誤時拋出異常供 fallback 捕獲

## 2. OpenCV 參數改進

- [x] 2.1 修改 `edge_detect.py`：Canny 閾值從 (50,150) 改為 (30,100)
- [x] 2.2 修改 `edge_detect.py`：最小面積從 0.1% 降為 0.01%
- [x] 2.3 修改 `edge_detect.py`：新增 CLAHE 對比度增強預處理
- [x] 2.4 修改 `edge_detect.py`：Dilate kernel 從 3×3 擴大到 5×5

## 3. 三層 Fallback 管線

- [x] 3.1 重構 `autoAnalyze.ts` Phase 2：先呼叫 `detectContourWithGemini()`
- [x] 3.2 Gemini 失敗時 fallback 到 `detectEdges()`（OpenCV）
- [x] 3.3 兩者都失敗時回傳 `{ contours: [], method: "none" }`
- [x] 3.4 SSE 事件加入 `method` 欄位標示偵測方式來源

## 4. 測試驗證

- [x] 4.1 Build 成功（vite build 無錯誤）
- [x] 4.2 E2E 測試無回歸（14/14 passed）
- [ ] 4.3 部署到生產環境
- [ ] 4.4 手動測試：上傳電池照片 → 確認 Gemini 偵測到輪廓
