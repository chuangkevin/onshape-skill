## Why

smart-contour-detection 已建立 FastSAM 本地偵測 + Gemini fallback 的雙層管線，但目前實作有三個致命缺陷：fastsam_segment.py 缺乏品質驗證、Gemini fallback 先裁切圖片再呼叫（2 次 API call + 需要 OpenCV crop 腳本）、整個管線沒有輪廓品質閘門，導致垃圾輪廓（點數不足、面積覆蓋整張圖）仍會推送到前端。此次重新設計目的是讓管線更健壯、成本更低。

## What Changes

- **移除 crop_image.py**：刪除裁切輔助腳本，不再依賴 OpenCV 裁切流程
- **改寫 fastsam_segment.py**：加入品質驗證（點數 < 6 視為失敗）；模型檔案遺失時自動下載
- **簡化 detectContourWithGemini**：改為單次 API call，將 bbox 座標寫入 prompt 文字作為 ROI 提示，不再裁切圖片
- **新增輪廓品質閘門**：管線每層偵測後，若輪廓點數 < 6 或面積比 > 0.85（相對 bbox），則拒絕並嘗試下一層
- **SSE contour-update 僅在通過品質閘門後才發送**

## Capabilities

### New Capabilities

- `contour-quality-gate`：統一的輪廓品質驗證邏輯，在管線各層結果之間作為閘門，拒絕低品質輪廓並觸發 fallback

### Modified Capabilities

- `fastsam-segmentation`：加入品質驗證與模型自動下載，改變 fastsam_segment.py 的輸出契約（失敗時明確回傳錯誤而非空結果）

## Impact

- `tools/measure/src/server/python/crop_image.py`：**刪除**
- `tools/measure/src/server/python/fastsam_segment.py`：加入品質驗證 + 自動下載模型
- `tools/measure/src/server/services/contour.ts`：`detectContourWithGemini` 改為單次 call + bbox hint；`detectContourWithFastSAM` 整合品質閘門
- `tools/measure/src/server/services/autoAnalyze.ts`：管線加入品質閘門邏輯，控制 SSE 發送時機
- Gemini API 成本降低（fallback 從 2 calls 減至 1 call）
- 不影響現有 SSE 事件格式，不影響前端
