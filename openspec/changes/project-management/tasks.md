## 1. 清理 + 測試隔離

- [x] 1.1 新增 DB migration 清除 name='Test Project' 或 'Listed Project' 的垃圾資料
- [x] 1.2 routes.test.ts 改用 createTestDb() in-memory DB，不污染正式 DB
- [x] 1.3 測試確認

## 2. 專案列表 Landing Page

- [x] 2.1 index.html 新增 #projectLanding overlay（專案卡片列表 + 新建按鈕）
- [x] 2.2 main.ts 啟動時顯示 Landing Page（取代自動載入最新專案）
- [x] 2.3 點擊專案卡片 → 載入該專案並進入 workspace
- [x] 2.4 點擊新建 → prompt 輸入名稱 → 建立空專案 → 進入 workspace
- [x] 2.5 刪除按鈕 → confirm → 呼叫 DELETE API → 刷新列表
- [x] 2.6 CSS 樣式（卡片、grid、hover 效果）

## 3. Sidebar 專案切換

- [x] 3.1 左側 sidebar 上方顯示當前專案名稱
- [x] 3.2 「← 返回專案列表」按鈕
- [x] 3.3 點擊返回 → 顯示 Landing Page + 清空 workspace

## 4. 驗證

- [x] 4.1 Playwright E2E：新建專案 → 上傳 → 返回列表 → 開另一個 → 刪除
- [x] 4.2 全部 unit test 通過且 DB 無垃圾
