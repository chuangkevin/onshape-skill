## Why

生產環境的自動分析流程存在三個嚴重 bug，導致 AI 偵測結果無法正確反映到 UI：
1. 新建專案時舊照片殘留，因為 `handleFiles()` 用 spread 附加而非替換 photos 陣列
2. AI 偵測到尺規後呼叫 `store.setScale()`，但 store subscriber 只呼叫 `autoAdvance()`，沒有呼叫 `renderUI()`，導致右側面板仍顯示「尚未校準」
3. Wizard step 2→3 切換時，即使 contour SSE 已完成並寫入 store，wizard 仍顯示「未偵測到輪廓」，因為 `updateWizard()` 沒有在 store 變更時重新執行

## What Changes

- **修正 `handleFiles()` 新專案邏輯**：當建立新專案時，不帶入舊專案的 photos 陣列
- **修正 store subscriber**：`store.subscribe()` 回調加入 `renderUI()` 和 `updateWizard()`，確保 SSE 寫入 store 後 UI 即時更新
- **修正 wizard step 3 輪廓顯示**：確保 SSE contour 結果正確觸發 wizard 內容刷新
- **新增 deploy 環境變數注入**：CI/CD 流程注入 `GEMINI_API_KEYS` 到伺服器 `.env`

## Capabilities

### New Capabilities
- `auto-analysis-ui-sync`: 修正 AI 自動分析結果（尺規、輪廓、標籤）正確回寫到 store 並即時更新 UI，包含 wizard 各步驟狀態同步
- `deploy-env-injection`: CI/CD 部署流程注入環境變數（GEMINI_API_KEYS）到伺服器

### Modified Capabilities

(無修改既有 spec)

## Impact

- **前端 `main.ts`**：`handleFiles()`、`store.subscribe()` 回調、`updateWizard()` 調用時機
- **前端 `store.ts`**：無需修改（`setScale`/`addDrawing` 已正確呼叫 `notify()`）
- **CI/CD `deploy.yml`**：新增 `.env` 寫入步驟
- **`docker-compose.yml`**：新增 `env_file` 指向 `.env`
- **E2E 測試**：可能需要更新測試以驗證 UI 同步行為
