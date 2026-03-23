## Context

Express server 已有 `app.get('*', ...)` fallback 回傳 `index.html`，所以任何路徑直接訪問都能載入 SPA。Client 端目前只有兩個視圖：landing page 和 project workspace，切換完全透過 DOM 顯示/隱藏，URL 不變。

## Goals / Non-Goals

**Goals:**
- `/` → landing page
- `/projects/:id` → project workspace
- 瀏覽器上一頁/下一頁正常切換
- 直接輸入 URL（或重新整理）可正確載入對應頁面

**Non-Goals:**
- 不加 `/projects/:id/photo/:photoId` 子路由（wizard step 不進 URL，避免複雜度）
- 不引入 router library
- 不改 Express server

## Decisions

### 1. 純 History API，無 hash

**決定**：用 `history.pushState` / `history.replaceState`，URL 格式 `/projects/123`。

**理由**：Express 已有 `*` fallback，history API 可行。hash routing 的 `/#/projects/123` 不夠乾淨。

### 2. `showLanding` / `openProject` 加 `pushHistory` 參數

**決定**：兩個函數加 `pushHistory = true` 預設參數。`popstate` handler 呼叫時傳 `false`，避免重複 pushState。

### 3. `init()` 解析 pathname

**決定**：`init()` 最後讀 `window.location.pathname`，匹配 `/projects/(\d+)` 則呼叫 `openProject(id, false)`，否則 `showLanding(false)`。

## Risks / Trade-offs

- `popstate` 只在使用者點瀏覽器按鈕時觸發，不在 pushState 時觸發 — 這是正確行為
- Project id 為 integer，URL 固定為 `/projects/123`，不是 GUID — 簡單足夠，未來可加 UUID 欄位
