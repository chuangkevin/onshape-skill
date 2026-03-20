## ADDED Requirements

### Requirement: 生成 endpoint

POST /api/generate-featurescript SHALL 接受 measurement JSON body 並回傳 FeatureScript 程式碼。Server MUST 使用 Gemini API 搭配 onshape-skill 的 SKILL.md prompt 生成程式碼。回傳格式 SHALL 為 `{ "code": "<featurescript string>" }`。

#### Scenario: 成功生成
- **WHEN** Client 發送 POST /api/generate-featurescript 帶有完整的 measurement JSON
- **THEN** Server 回傳 200 + FeatureScript 程式碼字串

#### Scenario: measurement 資料不完整
- **WHEN** Client 發送的 measurement JSON 缺少 contour_mm
- **THEN** Server 回傳 400 + 錯誤訊息

#### Scenario: Gemini API 失敗
- **WHEN** Gemini API 呼叫失敗或逾時
- **THEN** Server 回傳 502 + 錯誤訊息，前端顯示「生成失敗，請重試」

### Requirement: 前端顯示

前端 SHALL 在 modal 中顯示生成的 FeatureScript 程式碼，使用 `<pre><code>` 格式。Modal MUST 包含「複製」按鈕，點擊後將程式碼複製到剪貼簿。

#### Scenario: 顯示生成結果
- **WHEN** FeatureScript 生成成功
- **THEN** 開啟 modal 顯示格式化的程式碼 + 複製按鈕

#### Scenario: 複製程式碼
- **WHEN** 使用者點擊「複製」按鈕
- **THEN** 程式碼複製到剪貼簿，按鈕文字暫時變為「已複製」
