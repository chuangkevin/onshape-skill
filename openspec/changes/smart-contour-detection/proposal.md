## Why

目前輪廓偵測依賴 OpenCV Canny edge detection，在光線不均、背景雜亂的照片上準確率不穩定；Gemini 直接回傳輪廓多邊形品質差（只給粗略矩形）。需要一個更準確且在 Raspberry Pi 4 (4GB) 上可運作的偵測管線。

## What Changes

- **新增 Phase 1**：Python FastSAM 對上傳照片做即時 segmentation，2-4 秒內回傳初步輪廓，透過現有 SSE 串流立即顯示
- **新增 Phase 2**：Gemini grounding web search 根據識別出的型號搜尋官方規格圖/拆機照，對多張參考圖各自做輪廓偵測，ICP alignment 取形狀交集，透過 SSE 推送校正後輪廓替換 Phase 1 結果
- **修改現有分析管線**：原 OpenCV Canny → bbox ROI 流程降為備援（Phase 1 失敗時使用）
- **新增 Python 依賴**：fastsam、ultralytics（FastSAM 基底）
- **新增 UI 狀態**：輪廓來源標示（FastSAM / Web-calibrated / OpenCV / Gemini-fallback）

## Capabilities

### New Capabilities

- `fastsam-segmentation`：FastSAM 本地 segmentation，對上傳圖片做即時輪廓偵測，回傳多邊形座標
- `web-reference-calibration`：Gemini web search 抓取同型號參考圖，多圖輪廓 ICP 對齊取交集，輸出高置信度輪廓

### Modified Capabilities

- （無現有 spec 需要修改）

## Impact

- `src/server/python/edge_detect.py`：新增 FastSAM inference 模式
- `src/server/services/contour.ts`：整合兩階段管線，Phase 2 作為背景任務
- `src/server/routes/analyze.ts`：SSE 新增 `contour-update` 事件類型（Phase 2 推送）
- `src/client/canvas/ContourLayer.ts`：接收 `contour-update` 替換現有輪廓
- 新增依賴：`fastsam`（Python，~23MB 模型），`scipy`（ICP alignment）
- Pi 4 資源：FastSAM 推論 ~2-4s CPU，模型常駐記憶體 ~200MB
