## Why

目前的輪廓偵測只依賴 OpenCV Canny 邊緣檢測，對低對比度物體（如木桌上的黑色電池）效果極差，經常回傳空結果（「未偵測到輪廓」）。業界最佳實踐是使用 AI 視覺模型（Gemini 2.5 / SAM）進行物件分割，再用 OpenCV 做後處理。本專案已有 Gemini 整合基礎，應善用 Gemini 2.5 的多邊形分割能力作為主要偵測方式，OpenCV 作為備選。

## What Changes

- **新增 Gemini 多邊形分割**：用 Gemini 2.5 直接回傳物件輪廓的多邊形座標（主要偵測方式）
- **改進 OpenCV 參數**：降低 Canny 閾值、放寬面積過濾、加入自適應閾值（備選方式）
- **重構 autoAnalyze.ts 分析流程**：Gemini 多邊形 → OpenCV 邊緣 → 通知使用者手動描繪（三層 fallback）
- **SSE 事件增強**：回傳輪廓偵測方法來源（gemini / opencv / manual）

## Capabilities

### New Capabilities
- `gemini-contour-detection`: 使用 Gemini 2.5 視覺模型直接偵測物件輪廓多邊形，回傳像素座標點陣列
- `hybrid-contour-pipeline`: 三層 fallback 輪廓偵測管線（Gemini → OpenCV → 手動），確保穩健性

### Modified Capabilities

(無)

## Impact

- **新增 `src/server/services/contour.ts`**：Gemini 多邊形分割邏輯
- **修改 `src/server/services/autoAnalyze.ts`**：重構 Phase 2 為三層 fallback
- **修改 `src/server/python/edge_detect.py`**：改進 Canny 閾值和面積過濾
- **修改 `src/server/services/opencv.ts`**：傳遞改進後的參數
- **前端不需修改**：輪廓結果格式（`contours[].contour_px`）保持一致
