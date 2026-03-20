## Why

Photo Measurement Tool 的核心功能已完成，但使用者體驗有嚴重問題：上傳照片後不知道下一步、OpenCV 因 Python 路徑問題完全無法使用、AI 分析按了沒有回饋、多張照片無法綁定為同一零件。工具將部署在 RPi 4 Docker 上，需要效能最佳化。

## What Changes

- **修復 Python 路徑偵測**：啟動時用 `where`/`which` 取得完整路徑並快取，Docker 環境支援固定路徑
- **雙模式流程引導**：新增引導模式（Wizard 步驟精靈）和自由模式，首次使用讓用戶選擇，可記住偏好
- **SSE 即時分析進度**：AI 分析改用 Server-Sent Events，前端即時顯示 OCR/搜尋/輪廓/OpenCV 各子任務狀態
- **多照片 Views 綁定**：Project = 零件概念，多張照片作為不同 Views（俯視/側視/特寫），共用比例尺（可個別覆蓋）
- **RPi 4 OpenCV 最佳化**：edge detection 前先 resize 到 1024px，減少 ARM CPU 負擔

## Capabilities

### New Capabilities
- `wizard-mode`: 引導模式步驟精靈，一步步帶使用者完成量測流程
- `mode-selector`: 首次使用模式選擇（引導/自由），偏好記憶到 localStorage
- `sse-analysis`: Server-Sent Events 即時分析進度串流
- `rpi-optimization`: RPi 4 Docker 部署最佳化（照片 resize、Python 路徑）

### Modified Capabilities
- `opencv-edge-detection`: Python 路徑偵測改為完整路徑，照片先 resize 到 1024px
- `photo-upload`: 多照片 Views 綁定（俯視/側視/特寫），共用比例尺
- `scale-calibration`: 支援專案級共用比例尺，特寫照片可個別覆蓋
- `ai-analysis-pipeline`: 改為 SSE 串流，拆分子任務獨立回報進度

## Impact

- **Server**: 新增 SSE endpoint，修改 analyze route，修改 opencv.ts Python 路徑邏輯
- **Client**: 新增 Wizard UI 元件、模式選擇器、SSE EventSource 進度面板
- **Docker**: 需要新增 Dockerfile 和 docker-compose.yml（RPi 4 ARM64）
- **DB**: 無 schema 變更（photos 表已有 project_id 和 angle 欄位）
