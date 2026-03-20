## ADDED Requirements

### Requirement: 下一步按鈕

分析完成後，系統 SHALL 在右側面板操作區域上方顯示「下一步」按鈕組，包含：「預覽 CAD 模型」、「生成 FeatureScript」、「匯出 JSON」、「複製 JSON」。按鈕 MUST 以醒目樣式顯示，主要操作（預覽 CAD、生成 FeatureScript）SHALL 使用 primary 樣式。

#### Scenario: 分析完成後顯示按鈕
- **WHEN** AI 分析完成
- **THEN** 右側面板最上方顯示「下一步」按鈕組

#### Scenario: 點擊預覽 CAD
- **WHEN** 使用者點擊「預覽 CAD 模型」
- **THEN** 開啟 Three.js 預覽 modal

#### Scenario: 點擊生成 FeatureScript
- **WHEN** 使用者點擊「生成 FeatureScript」
- **THEN** 呼叫 /api/generate-featurescript 並開啟結果 modal

### Requirement: 狀態感知

按鈕 SHALL 根據當前分析狀態啟用或禁用。無輪廓資料時「預覽 CAD 模型」MUST 為禁用。無分析結果時「生成 FeatureScript」MUST 為禁用。

#### Scenario: 無輪廓資料
- **WHEN** 分析完成但未偵測到輪廓
- **THEN** 「預覽 CAD 模型」按鈕為禁用狀態，顯示提示「需要輪廓資料」

#### Scenario: 完整分析資料
- **WHEN** 分析完成且輪廓+標籤+OCR 皆有資料
- **THEN** 所有按鈕皆為啟用狀態
