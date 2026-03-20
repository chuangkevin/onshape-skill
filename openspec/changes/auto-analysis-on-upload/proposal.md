## Why

Playwright UX 審計揭露核心問題：使用者上傳照片後不知道如何操作，需要手動校準比例尺和描繪輪廓。但照片中的尺規刻度和零件邊緣，Gemini Vision 和 OpenCV 都能自動辨識。流程應該從「使用者手動操作 → AI 後補」翻轉為「AI 先跑 → 使用者確認/微調」。

## What Changes

- **上傳即分析**：照片上傳後立刻在背景並行觸發 Gemini 讀尺規 + OpenCV 偵測輪廓 + Gemini OCR 讀標籤，用 SSE 即時回報進度
- **Gemini 尺規辨識服務**：新的 Gemini prompt 偵測照片中的尺規刻度，回傳起點/終點像素座標 + 真實距離，自動計算 px/mm
- **Wizard 改為確認流程**：步驟 2 從「手動點兩點」改為「AI 偵測到尺規 0~30cm，建議 4.56 px/mm，確認？」；步驟 3 從「手動描繪」改為「AI 預覽輪廓，使用者可微調」
- **移除右側重複操作流程面板**：Wizard 模式下右側只保留資料顯示（比例尺、特徵、尺寸），不再重複步驟說明
- **自動分析 SSE endpoint**：`POST /api/projects/:id/photos/:photoId/auto-analyze` 上傳後觸發，SSE 回報各子任務進度

## Capabilities

### New Capabilities
- `auto-ruler-detection`: Gemini Vision 自動偵測照片中的尺規刻度並計算 px/mm
- `upload-auto-analysis`: 上傳照片後立刻並行觸發 AI + OpenCV 自動分析
- `wizard-confirm-flow`: Wizard 步驟從手動操作改為確認 AI 結果

### Modified Capabilities
- `wizard-mode`: 步驟邏輯從「手動操作」改為「確認 AI 結果」
- `ai-analysis-pipeline`: 新增上傳時自動觸發的輕量分析（尺規+輪廓+標籤）
- `scale-calibration`: 新增 AI 自動校準，使用者只需確認
- `opencv-edge-detection`: 上傳後自動觸發，結果作為預覽輪廓

## Impact

- **Server**: 新增 auto-analyze SSE endpoint、ruler detection Gemini service
- **Client**: Wizard 步驟邏輯大改、右側面板簡化、上傳後顯示分析進度
- **Gemini prompts**: 新增尺規偵測 prompt（要求像素座標回傳）
- **UX**: 從 5 步手動操作 → 3 步確認（上傳→確認→匯出）
