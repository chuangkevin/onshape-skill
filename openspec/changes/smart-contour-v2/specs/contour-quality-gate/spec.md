## ADDED Requirements

### Requirement: 輪廓點數最低門檻
管線 SHALL 拒絕任何 `contour_px.length < 6` 的輪廓，視為偵測失敗並嘗試下一層。

#### Scenario: 點數不足的 FastSAM 輪廓被拒絕
- **WHEN** FastSAM 回傳的輪廓點數少於 6
- **THEN** 管線不發送 SSE `contour-update`，改嘗試 Gemini fallback

#### Scenario: 點數不足的 Gemini 輪廓被拒絕
- **WHEN** Gemini 回傳的輪廓點數少於 6
- **THEN** 管線不發送 SSE `contour-update`，以 `{ contours: [], method: 'none' }` 結束

#### Scenario: 點數足夠的輪廓通過閘門
- **WHEN** 任一層回傳輪廓且點數 >= 6
- **THEN** 管線繼續進行面積比驗證

### Requirement: 輪廓面積比上限
管線 SHALL 拒絕外接矩形面積超過 bbox 面積 85% 的輪廓，視為背景誤判並嘗試下一層。當 `bboxResult` 不存在時，與全圖面積比較。

#### Scenario: 覆蓋整張圖的輪廓被拒絕
- **WHEN** FastSAM 或 Gemini 回傳的輪廓外接矩形 > 85% bbox 面積
- **THEN** 管線不發送 SSE `contour-update`，改嘗試下一層

#### Scenario: 合理大小的輪廓通過閘門
- **WHEN** 輪廓外接矩形 <= 85% bbox 面積
- **THEN** 管線發送 SSE `contour-update` 並記錄偵測方法

#### Scenario: bbox 不存在時以全圖面積計算
- **WHEN** `bboxResult` 不存在或 `found: false`
- **THEN** 面積比以輪廓外接矩形 / 圖片總面積計算，閾值維持 85%

### Requirement: 品質閘門後才發送 SSE contour-update
系統 SHALL 僅在輪廓通過點數與面積比品質閘門後，才透過 SSE 發送 `contour-update` 事件。

#### Scenario: 品質通過即時推送
- **WHEN** 管線某層（FastSAM 或 Gemini）產生通過品質閘門的輪廓
- **THEN** 立即發送 SSE `contour-update`，不等待後續層

#### Scenario: 所有層皆失敗時不推送 contour-update
- **WHEN** FastSAM 與 Gemini 輪廓均未通過品質閘門
- **THEN** 不發送 SSE `contour-update`；`contour` step 以 `{ contours: [], method: 'none' }` 完成
