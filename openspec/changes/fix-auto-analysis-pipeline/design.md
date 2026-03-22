## Context

照片量測工具的自動分析流程使用 SSE（Server-Sent Events）從伺服器串流 AI 分析結果到前端。流程為：

1. 上傳照片 → 2. SSE 連線 → 3. Gemini 偵測尺規/bbox/標籤（Phase 1 並行）→ 4. OpenCV 偵測輪廓（Phase 2）→ 5. 完成

**伺服器端**正確運作：Gemini 呼叫成功、OpenCV 輪廓偵測成功、SSE 事件正確發送。

**前端問題**：SSE handler 收到結果後，呼叫 `store.setScale()` 和 `store.addDrawing()`，但：
- `store.subscribe()` 的回調只呼叫 `autoAdvance()`，不呼叫 `renderUI()`
- Wizard UI 不會自動刷新，導致使用者看到過期的狀態
- `handleFiles()` 在新專案時仍帶入舊照片

## Goals / Non-Goals

**Goals:**
- SSE 分析結果寫入 store 後，右側面板（比例尺、特徵）立即更新
- Wizard 各步驟正確反映 AI 分析狀態（尺規已偵測、輪廓已偵測）
- 新建專案時清空舊照片
- CI/CD 能自動注入 GEMINI_API_KEYS 到部署伺服器

**Non-Goals:**
- 不重構 store 架構（現有 pub/sub 模式足夠）
- 不改變 SSE 協議格式
- 不修改伺服器端分析邏輯

## Decisions

### 1. 在 `store.subscribe()` 加入 `renderUI()` 呼叫

**決定**：在現有 subscriber 回調中加入 `renderUI()` + `updateWizard()` 呼叫。

**替代方案**：在每個 SSE event handler 中手動呼叫 `renderUI()`。
**否決原因**：分散在多處容易遺漏，且未來新增 store mutation 時仍會有同樣問題。統一在 subscriber 中處理更可靠。

**注意**：需加入防重入機制（renderUI 內部可能觸發 store 變更），使用 flag 變數避免遞迴。

### 2. `handleFiles()` 新專案清空照片

**決定**：當 `!projectId`（新建專案）時，不 spread `store.getState().photos`，直接用上傳的照片作為完整陣列。

**替代方案**：在 `store.setProject()` 時自動清空 photos。
**否決原因**：`setProject()` 也用於 openProject 切換場景，那裡有自己的照片載入邏輯。在 `handleFiles` 局部修正更安全。

### 3. CI/CD 環境變數注入

**決定**：在 deploy.yml 中新增步驟，用 SSH 將 `GEMINI_API_KEYS` 寫入伺服器的 `.env` 檔案，docker-compose.yml 加上 `env_file: .env`。

**替代方案**：直接在 docker-compose.yml 的 environment 中硬寫 keys。
**否決原因**：API keys 不應出現在版本控制中。

## Risks / Trade-offs

- **renderUI 效能**：subscriber 每次 store 變更都呼叫 renderUI，可能影響高頻操作（如拖曳）→ 使用 `requestAnimationFrame` 合併連續呼叫
- **Wizard 狀態競態**：SSE 事件可能在 wizard 切換步驟時到達 → updateWizard 應檢查當前步驟再更新
- **GitHub Secret 長度限制**：9 個 API keys 的字串約 350 字元，遠低於 GitHub Secret 的 64KB 限制 → 無風險
