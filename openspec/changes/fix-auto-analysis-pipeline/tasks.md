## 1. 新專案照片清空

- [x] 1.1 修正 `handleFiles()` — 當 `!projectId`（新建專案）時，photos 陣列不 spread 舊照片，僅包含新上傳的照片
- [x] 1.2 驗證：既有專案追加照片仍正常（spread 保留）

## 2. Store → UI 即時同步

- [x] 2.1 在 `store.subscribe()` 回調中加入 `renderUI()` 呼叫，使用 `requestAnimationFrame` 合併連續呼叫
- [x] 2.2 加入防重入 flag（`_isRendering`），避免 renderUI 內部觸發 store 變更造成遞迴
- [x] 2.3 在 `store.subscribe()` 回調中加入 `updateWizard()` 呼叫（僅在 wizard 模式下）
- [x] 2.4 驗證：SSE 尺規偵測完成後，右側面板比例尺立即從「尚未校準」變為偵測值

## 3. Wizard 輪廓步驟修正

- [x] 3.1 確認 SSE contour handler 呼叫 `store.addDrawing()` 後加入 `renderDrawings()` 繪製 canvas
- [x] 3.2 確認 wizard step 3 進入時自動呼叫 `renderDrawings()` 繪製 canvas 上的輪廓
- [x] 3.3 驗證：上傳照片 → AI 分析完成 → wizard step 2 顯示比例尺 → step 3 顯示輪廓

## 4. CI/CD 環境變數注入

- [x] 4.1 在 deploy.yml 新增 "Write .env to server" 步驟，透過 SSH 寫入 `GEMINI_API_KEYS`
- [x] 4.2 在 docker-compose.yml 加入 `env_file: .env`
- [ ] 4.3 在 GitHub repo 設定 `GEMINI_API_KEYS` secret
- [ ] 4.4 驗證：重新部署後 AI 分析功能在生產環境正常運作

## 5. E2E 測試驗證

- [x] 5.1 執行完整 E2E 測試套件確認無回歸（19/20 通過，1 個已知超時）
- [ ] 5.2 手動測試：新建專案 → 上傳照片 → 確認舊照片不殘留
- [ ] 5.3 手動測試：wizard 全流程 → 確認比例尺和輪廓正確顯示
