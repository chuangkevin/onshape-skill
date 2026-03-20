## ADDED Requirements

### Requirement: SSE endpoint
GET /api/projects/:id/analyze-stream SHALL 回傳 Content-Type 為 text/event-stream 的回應，使用 Server-Sent Events 協議即時推送分析進度。

#### Scenario: 建立 SSE 連線
- **WHEN** 前端對 GET /api/projects/123/analyze-stream 發起請求
- **THEN** 伺服器 SHALL 回傳 HTTP 200，Content-Type 為 text/event-stream，並保持連線開啟

#### Scenario: 分析完成後關閉連線
- **WHEN** 所有子任務皆完成
- **THEN** 伺服器 SHALL 發送 event: done 事件後關閉連線

### Requirement: 子任務進度事件
系統 SHALL 為每個子任務（ocr、labels、search、opencv、fusion）發送獨立的進度事件，事件格式 MUST 包含 task 名稱、status 狀態、以及 progress 百分比。

#### Scenario: 子任務開始
- **WHEN** ocr 子任務開始執行
- **THEN** 伺服器 SHALL 發送 event: progress，data 包含 {"task": "ocr", "status": "running", "progress": 0}

#### Scenario: 子任務完成
- **WHEN** labels 子任務執行完成
- **THEN** 伺服器 SHALL 發送 event: progress，data 包含 {"task": "labels", "status": "done", "progress": 100}

#### Scenario: 子任務失敗
- **WHEN** opencv 子任務執行失敗
- **THEN** 伺服器 SHALL 發送 event: progress，data 包含 {"task": "opencv", "status": "error", "error": "<錯誤訊息>"}

### Requirement: 前端進度面板
前端 SHALL 顯示每個子任務的即時狀態面板，狀態包含：等待中、進行中、已完成、失敗。

#### Scenario: 顯示所有子任務狀態
- **WHEN** SSE 連線建立後
- **THEN** 前端 SHALL 顯示 5 個子任務列（ocr、labels、search、opencv、fusion），初始狀態皆為「等待中」

#### Scenario: 即時更新狀態
- **WHEN** 收到 ocr 子任務的 status: running 事件
- **THEN** 前端 SHALL 將 ocr 列的狀態從「等待中」更新為「進行中」，並顯示進度百分比

#### Scenario: 失敗狀態顯示
- **WHEN** 收到某子任務的 status: error 事件
- **THEN** 前端 SHALL 將該子任務列標示為紅色「失敗」狀態，並顯示錯誤訊息

### Requirement: 逾時處理
若 30 秒內未收到任何 SSE 事件，前端 SHALL 顯示逾時錯誤訊息並關閉連線。

#### Scenario: 逾時觸發
- **WHEN** SSE 連線建立後超過 30 秒未收到任何事件
- **THEN** 前端 SHALL 關閉 EventSource 連線，並顯示「分析逾時，請重試」錯誤訊息

#### Scenario: 事件重置計時器
- **WHEN** 在第 25 秒收到一個 progress 事件
- **THEN** 逾時計時器 SHALL 重置為 30 秒，從收到事件的時間重新計算
