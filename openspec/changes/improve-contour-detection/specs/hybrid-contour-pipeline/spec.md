## ADDED Requirements

### Requirement: 三層 Fallback 輪廓偵測管線
autoAnalyze 的 Phase 2 SHALL 按序嘗試三種輪廓偵測方式：Gemini 多邊形 → OpenCV 邊緣檢測 → 無結果通知。

#### Scenario: Gemini 偵測成功
- **WHEN** `detectContourWithGemini()` 成功回傳 `found: true` 且有有效 contours
- **THEN** 系統 SHALL 直接使用 Gemini 結果，不呼叫 OpenCV，SSE 回傳 `method: "gemini"`

#### Scenario: Gemini 失敗，OpenCV 成功
- **WHEN** `detectContourWithGemini()` 失敗或回傳 `found: false`，且 `detectEdges()` 成功回傳有效 contours
- **THEN** 系統 SHALL 使用 OpenCV 結果，SSE 回傳 `method: "opencv"`

#### Scenario: 兩者都失敗
- **WHEN** Gemini 和 OpenCV 都無法偵測到輪廓
- **THEN** 系統 SHALL 回傳 `{ contours: [], method: "none" }`，前端顯示「未偵測到輪廓，請手動描繪」

### Requirement: 改進 OpenCV 邊緣檢測參數
OpenCV 邊緣檢測 SHALL 使用改進後的參數以提高對低對比度物體的偵測能力。

#### Scenario: 低對比度物體偵測
- **WHEN** 傳入黑色電池在木桌上的照片
- **THEN** OpenCV 邊緣檢測 SHALL 使用 Canny 閾值 (30, 100)、最小面積 0.01%、CLAHE 對比度增強

#### Scenario: 結果格式一致
- **WHEN** 輪廓偵測完成（無論使用哪種方法）
- **THEN** 回傳格式 SHALL 為 `{ contours: [{ contour_px: [...], area, bbox }], method, image_width, image_height }`，與現有前端渲染邏輯相容
