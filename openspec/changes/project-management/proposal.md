## Why

App 啟動後自動載入舊專案的舊照片，使用者無法新建、切換、刪除專案。Unit test 污染正式 DB 產生大量垃圾資料。

## What Changes

- **專案列表 Landing Page**：啟動時顯示所有專案卡片 + 新建按鈕
- **專案 CRUD UI**：新建（名稱）、刪除（含照片清理）、開啟
- **左側 sidebar 專案切換**：上方顯示當前專案名稱 + 返回列表按鈕
- **Unit test 隔離**：routes.test.ts 改用 in-memory DB
- **清理垃圾資料**：migration 清除 test 資料

## Capabilities

### New Capabilities
- `project-landing`: 專案列表 Landing Page
- `project-sidebar`: 左側 sidebar 專案切換

### Modified Capabilities
- `photo-upload`: 上傳前必須先有 active project

## Impact

- Client: 新增 Landing Page、sidebar 專案切換
- Tests: routes.test.ts 改用 in-memory DB
- DB: 新增 migration 清理垃圾
