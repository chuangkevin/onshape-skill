## MODIFIED Requirements

### Requirement: FastSAM Phase 1 segmentation
系統 SHALL 在照片分析的 Phase 1 使用 FastSAM 對上傳圖片做 segmentation，回傳初步輪廓多邊形，並透過 SSE `contour-update` 事件推送給前端。fastsam_segment.py SHALL 在回傳前對輸出輪廓進行點數驗證（>= 6 點）；回傳的輪廓若點數不足，視為偵測失敗並輸出空 contours。

#### Scenario: FastSAM 成功偵測到物件
- **WHEN** 使用者觸發自動分析，且 FastSAM 模型可用
- **THEN** fastsam_segment.py 輸出 contours 陣列，每個輪廓的 `contour_px.length >= 6`

#### Scenario: FastSAM 輸出點數不足
- **WHEN** FastSAM 推論產生的輪廓多邊形點數 < 6
- **THEN** fastsam_segment.py 輸出 `{ "contours": [] }`，管線觸發品質閘門拒絕並 fallback

#### Scenario: FastSAM 不可用（import error）
- **WHEN** Python 環境未安裝 ultralytics
- **THEN** 系統自動 fallback 到 Gemini 管線，不中斷分析流程

### Requirement: FastSAM 模型自動下載
系統 SHALL 在 fastsam_segment.py 找不到本地模型檔時，透過 ultralytics 內建工具自動下載 FastSAM-s.pt 到 user cache 目錄，不中斷分析流程。下載失敗時 SHALL 回傳 `fastsam_unavailable` 讓管線 fallback。

#### Scenario: 本地模型存在直接使用
- **WHEN** 腳本同目錄或 `/app/models/` 存在 `FastSAM-s.pt`
- **THEN** fastsam_segment.py 直接載入本地模型，不觸發下載

#### Scenario: 模型不存在自動下載
- **WHEN** 找不到任何本地 FastSAM-s.pt 且 ultralytics 已安裝且網路可用
- **THEN** fastsam_segment.py 呼叫 ultralytics `check_file` 自動下載，下載完成後繼續推論

#### Scenario: 模型下載失敗
- **WHEN** 網路不可用或下載過程拋出例外
- **THEN** fastsam_segment.py 輸出 `{ "error": "fastsam_unavailable" }`，管線 fallback 到 Gemini

## REMOVED Requirements

### Requirement: FastSAM 模型預載（Docker build）
**Reason**: 改由 fastsam_segment.py 執行時自動下載，不再強制 Docker build 時預載；本地開發環境也不需要手動下載。
**Migration**: 刪除 Dockerfile 中 `RUN python -c "from ultralytics import FastSAM; FastSAM('FastSAM-s.pt')"` 等預載指令（若有）。
