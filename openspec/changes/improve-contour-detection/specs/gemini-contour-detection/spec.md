## ADDED Requirements

### Requirement: Gemini 2.5 多邊形輪廓偵測
系統 SHALL 提供 `detectContourWithGemini()` 函數，使用 Gemini 2.5 視覺模型偵測照片中主要物件的外輪廓，回傳像素座標點陣列。

#### Scenario: 成功偵測電池輪廓
- **WHEN** 傳入含有電池的照片（含木桌背景、尺規）
- **THEN** 系統 SHALL 回傳 `{ found: true, contours: [{ label: "...", contour_px: [{x, y}, ...] }] }`，座標為像素座標（原點左上角），點數 SHALL 介於 4-200 之間

#### Scenario: 照片無明確物件
- **WHEN** 傳入無明確主要物件的照片
- **THEN** 系統 SHALL 回傳 `{ found: false, contours: [] }`

#### Scenario: Gemini API 錯誤或額度用完
- **WHEN** Gemini API 回傳錯誤（429、500 等）
- **THEN** 系統 SHALL 拋出錯誤，由上層 fallback 邏輯捕獲

### Requirement: 排除非目標物件
Gemini prompt SHALL 明確指示排除尺規、卡尺、背景桌面、手指等非目標物件，只回傳主要零件/產品的輪廓。

#### Scenario: 照片中有尺規和電池
- **WHEN** 照片同時包含尺規和電池
- **THEN** 回傳的 contours SHALL 只包含電池的輪廓，不包含尺規

#### Scenario: 多個零件
- **WHEN** 照片中有多個零件
- **THEN** 回傳的 contours SHALL 包含所有零件的輪廓，按面積由大到小排序
