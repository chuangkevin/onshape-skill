## 1. PhotoLayer Ctrl+左鍵 Pan

- [ ] 1.1 在 PhotoLayer.ts 的 pointerdown handler 加入 `e.ctrlKey && e.button === 0` 作為 pan 觸發條件
- [ ] 1.2 確保 Ctrl+左鍵拖曳時 cursor 正確變為 grabbing
- [ ] 1.3 確保 Ctrl+左鍵拖曳時 `isPanningNow` 返回 true

## 2. 繪圖工具 Ctrl 避讓

- [ ] 2.1 PolylineTool: click handler 加入 `if (e.ctrlKey) return;`
- [ ] 2.2 EditContourTool: pointerdown handler 加入 `if (e.ctrlKey) return;`
- [ ] 2.3 ScaleTool: click handler 加入 `if (e.ctrlKey) return;`
- [ ] 2.4 ArcTool: click handler 加入 `if (e.ctrlKey) return;`（如存在）
- [ ] 2.5 HoleTool: click handler 加入 `if (e.ctrlKey) return;`（如存在）

## 3. 3D OrbitControls 配置

- [ ] 3.1 確認 CadPreview.ts 的 OrbitControls 已配置左鍵=ROTATE, 中鍵=DOLLY, 右鍵=PAN
- [ ] 3.2 確認 Ctrl+左鍵=pan 內建功能正常運作（OrbitControls 預設支援）
- [ ] 3.3 確認 enableDamping 已啟用

## 4. 測試驗證

- [ ] 4.1 Build 成功（vite build 無錯誤）
- [ ] 4.2 E2E 測試無回歸
- [ ] 4.3 手動測試：Ctrl+左鍵拖曳照片平移正常
- [ ] 4.4 手動測試：3D 預覽左鍵旋轉、Ctrl+左鍵平移正常
