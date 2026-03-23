## ADDED Requirements

### Requirement: 開啟 project 時更新 URL
系統 SHALL 在使用者開啟 project 時，將瀏覽器 URL 更新為 `/projects/:id`。

#### Scenario: 從 landing page 點擊開啟 project
- **WHEN** 使用者點擊 project card 的「開啟」按鈕
- **THEN** URL 變為 `/projects/{id}`，workspace 顯示，landing page 隱藏

### Requirement: 返回 landing page 時更新 URL
系統 SHALL 在使用者返回 landing page 時，將 URL 更新為 `/`。

#### Scenario: 點擊返回按鈕
- **WHEN** 使用者點擊「← 返回」按鈕
- **THEN** URL 變為 `/`，landing page 顯示，workspace 隱藏

### Requirement: 瀏覽器上一頁/下一頁正常運作
系統 SHALL 監聽 `popstate` 事件，依 URL 切換對應視圖。

#### Scenario: 使用者在 project workspace 按瀏覽器上一頁
- **WHEN** 使用者在 `/projects/123` 按瀏覽器上一頁（回到 `/`）
- **THEN** 系統顯示 landing page，不發生整頁重新整理

#### Scenario: 使用者按下一頁回到 project
- **WHEN** 使用者在 `/` 按瀏覽器下一頁（前往 `/projects/123`）
- **THEN** 系統開啟對應 project workspace

### Requirement: 直接連結 / 重新整理進入 project
系統 SHALL 在頁面載入時解析 URL，直接導向對應視圖。

#### Scenario: 直接訪問 /projects/123
- **WHEN** 使用者在瀏覽器輸入 `http://localhost:3000/projects/123` 或重新整理該頁
- **THEN** 系統直接載入 project 123 的 workspace，不先顯示 landing page
