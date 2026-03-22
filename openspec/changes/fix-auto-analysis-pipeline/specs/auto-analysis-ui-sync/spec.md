## ADDED Requirements

### Requirement: Store 變更即時更新 UI
當 store 的任何狀態發生變更（透過 `notify()`），系統 SHALL 自動呼叫 `renderUI()` 更新右側面板和狀態列，使用 `requestAnimationFrame` 合併連續呼叫避免效能問題。

#### Scenario: SSE 尺規偵測結果更新比例尺顯示
- **WHEN** SSE handler 收到 ruler step done 並呼叫 `store.setScale()`
- **THEN** 右側面板的比例尺資訊 SHALL 立即顯示偵測到的 px/mm 值和參考距離，不再顯示「尚未校準」

#### Scenario: SSE 輪廓偵測結果更新繪圖
- **WHEN** SSE handler 收到 contour step done 並呼叫 `store.addDrawing()`
- **THEN** canvas 上 SHALL 立即繪製偵測到的輪廓，右側面板 SHALL 顯示輪廓數量

#### Scenario: 防止 renderUI 遞迴
- **WHEN** renderUI 內部觸發 store 變更
- **THEN** 系統 SHALL 使用防重入 flag 避免遞迴呼叫 renderUI

### Requirement: Wizard 步驟即時反映 AI 分析狀態
當 store 變更時且處於 wizard 模式，系統 SHALL 呼叫 `updateWizard()` 刷新 wizard 內容。

#### Scenario: Wizard step 2 顯示已偵測的比例尺
- **WHEN** 使用者處於 wizard step 2 且 AI 已偵測到尺規（`photo.scale` 已設定）
- **THEN** wizard body SHALL 顯示「比例尺已設定：X px/mm」和「確認使用」按鈕

#### Scenario: Wizard step 3 顯示已偵測的輪廓
- **WHEN** 使用者處於 wizard step 3 且 AI 已偵測到輪廓（`photo.drawings` 有資料）
- **THEN** wizard body SHALL 顯示「已有 N 個輪廓」和確認/微調/重繪按鈕，canvas 上 SHALL 繪製輪廓

### Requirement: 新專案清空舊照片
當使用者透過檔案上傳建立新專案時，系統 SHALL 不帶入前一個專案的照片。

#### Scenario: 新建專案時 photos 陣列僅包含新上傳的照片
- **WHEN** `handleFiles()` 偵測到 `!projectId`（需建立新專案）
- **THEN** 上傳完成後的 photos 陣列 SHALL 僅包含新上傳的照片，不包含任何舊專案的照片

#### Scenario: 既有專案追加照片
- **WHEN** `handleFiles()` 偵測到 `projectId` 已存在
- **THEN** 新上傳的照片 SHALL 追加到既有的 photos 陣列中
