## ADDED Requirements

### Requirement: FastSAM Phase 1 segmentation
系統 SHALL 在照片分析的 Phase 1 使用 FastSAM 對上傳圖片做 segmentation，於 2-4 秒內回傳初步輪廓多邊形，並透過 SSE `contour-update` 事件推送給前端。

#### Scenario: FastSAM 成功偵測到物件
- **WHEN** 使用者觸發自動分析，且 FastSAM 模型可用
- **THEN** 系統在 4 秒內透過 SSE 推送 `{ type: "contour-update", source: "fastsam", contours: [...] }`

#### Scenario: FastSAM 無法偵測到物件
- **WHEN** FastSAM 未在圖片中找到主要物件（confidence < threshold）
- **THEN** 系統 fallback 到 OpenCV Canny 管線，SSE 推送 `{ source: "opencv" }`

#### Scenario: FastSAM 不可用（import error）
- **WHEN** Python 環境未安裝 ultralytics 或模型檔不存在
- **THEN** 系統自動 fallback 到 OpenCV 管線，不中斷分析流程

### Requirement: FastSAM 輪廓來源標示
系統 SHALL 在 SSE `contour-update` 事件的 `source` 欄位標示輪廓偵測來源（`fastsam` / `opencv` / `gemini` / `web-calibrated`），前端 SHALL 顯示對應標籤。

#### Scenario: 前端顯示輪廓來源
- **WHEN** 前端收到 `contour-update` 事件
- **THEN** ContourLayer 顯示來源標籤（如「FastSAM」、「Web 校正」）於輪廓旁或工具列

### Requirement: FastSAM 模型預載
系統 SHALL 在 Docker build 時預先下載 FastSAM-s 模型（~23MB），避免首次分析時才下載。

#### Scenario: Docker 環境首次啟動
- **WHEN** Docker container 啟動
- **THEN** FastSAM 模型已存在於 `/app/models/FastSAM-s.pt`，無需下載
