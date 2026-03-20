## 1. Export endpoint 改為接受前端資料

- [ ] 1.1 修改 POST /api/projects/:id/export：接受 body.photos 陣列（含 scale, drawings, dimensions, features）
- [ ] 1.2 fuseMeasurements 改用 body 資料而非 DB 查詢
- [ ] 1.3 前端 export 按鈕改為帶上完整 store.photos 資料

## 2. Scale 同步

- [ ] 2.1 Wizard 確認 scale 後呼叫 PATCH /api/projects/:id/photos/:photoId 更新 scale_data
- [ ] 2.2 手動 ScaleTool 完成後也呼叫 PATCH

## 3. SSE 結果正確帶入 store

- [ ] 3.1 auto-analyze ruler 結果：成功時自動 store.setScale()
- [ ] 3.2 auto-analyze contour 結果：成功時自動 store.addDrawing()
- [ ] 3.3 Wizard 步驟 2/3 根據 store 內已有的 scale/drawing 正確顯示

## 4. E2E 驗證

- [ ] 4.1 重跑 battery-full-flow.test.ts，measurement.json 應有完整資料
