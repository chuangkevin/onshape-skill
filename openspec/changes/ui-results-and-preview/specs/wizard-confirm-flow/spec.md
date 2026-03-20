## MODIFIED Requirements

### Requirement: 步驟 4 加入 AI 結果確認

Wizard 步驟 4 SHALL 在現有手動輸入欄位之上顯示 AI 結果確認面板（同 ai-results-panel 規格）。AI 偵測到的值 MUST 預填入對應欄位。使用者確認後 SHALL 自動帶入步驟 4 的表單。

#### Scenario: AI 結果預填
- **WHEN** 使用者進入 Wizard 步驟 4 且 AI 分析已完成
- **THEN** AI 偵測到的型號/規格自動填入表單欄位，並顯示確認面板

#### Scenario: 使用者修改 AI 結果
- **WHEN** 使用者在步驟 4 編輯 AI 預填的值
- **THEN** 修改後的值取代 AI 值，帶入後續步驟

#### Scenario: 無 AI 結果
- **WHEN** 使用者進入步驟 4 但 AI 分析未完成或失敗
- **THEN** 確認面板不顯示，使用者手動填入所有欄位

## ADDED Requirements

### Requirement: 步驟 5 加入 CAD 預覽

Wizard 步驟 5（匯出）SHALL 在匯出按鈕上方顯示「預覽 CAD 模型」按鈕。點擊後 MUST 開啟 Three.js 預覽 modal。步驟 5 SHALL 同時顯示「生成 FeatureScript」按鈕。

#### Scenario: 步驟 5 預覽
- **WHEN** 使用者進入 Wizard 步驟 5
- **THEN** 頁面顯示「預覽 CAD 模型」和「生成 FeatureScript」按鈕，位於匯出按鈕上方

#### Scenario: 預覽後匯出
- **WHEN** 使用者在步驟 5 看完 CAD 預覽後關閉 modal
- **THEN** 回到步驟 5，可繼續匯出 JSON
