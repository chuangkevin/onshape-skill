## Why

目前 SPA 沒有 URL routing：切換 project 或頁面時 URL 不變，重新整理會回到 landing page，無法用瀏覽器上一頁/下一頁，也無法直接分享 project 連結。

## What Changes

- `showLanding()` 呼叫時 pushState `'/'`
- `openProject(id)` 呼叫時 pushState `'/projects/:id'`
- 新增 `popstate` event listener：瀏覽器上一頁/下一頁時根據 URL 切換 landing/project
- `init()` 啟動時解析 `window.location.pathname`，直接導向對應頁面（支援直接進入 `/projects/123`）
- Express 已有 `app.get('*')` fallback，不需要改後端

## Capabilities

### New Capabilities

- `url-routing`：SPA URL routing，pushState/popstate/直接連結三種場景

### Modified Capabilities

（無）

## Impact

- `src/client/main.ts`：`showLanding`, `openProject`, `init` 三個函數，加上 `popstate` listener
- 不引入任何 router library
- Express server 無需改動（已有 fallback）
