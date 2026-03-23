## 1. Client routing

- [x] 1.1 `showLanding(pushHistory = true)`：加 `pushHistory` 參數，呼叫時執行 `if (pushHistory) history.pushState({}, '', '/')`
- [x] 1.2 `openProject(id, pushHistory = true)`：加 `pushHistory` 參數，呼叫時執行 `if (pushHistory) history.pushState({ projectId: id }, '', '/projects/' + id)`
- [x] 1.3 新增 `popstate` event listener：解析 `event.state?.projectId` 或 `location.pathname`，呼叫 `openProject(id, false)` 或 `showLanding(false)`
- [x] 1.4 `init()` 最後解析 `window.location.pathname`：匹配 `/projects/(\d+)` 則 `openProject(id, false)`，否則 `showLanding(false)`
- [x] 1.5 `backToLanding` click handler 改呼叫 `showLanding()`（已有 pushHistory）

## 2. 測試驗證

- [x] 2.1 Build 成功
- [ ] 2.2 手動測試：開啟 project → URL 變 `/projects/:id`
- [ ] 2.3 手動測試：返回 → URL 變 `/`
- [ ] 2.4 手動測試：瀏覽器上一頁/下一頁正常切換視圖
- [ ] 2.5 手動測試：直接訪問 `/projects/:id` 正確載入 project
