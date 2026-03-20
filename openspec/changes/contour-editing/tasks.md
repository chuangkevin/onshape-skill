## 1. EditContourTool 核心

- [ ] 1.1 建立 src/client/tools/EditContourTool.ts
- [ ] 1.2 Hover 偵測：計算滑鼠到每條線段的距離（point-to-segment），最近的線段 index + 最近的頂點 index
- [ ] 1.3 點擊頂點選中（黃色高亮），按 Delete 刪除選中頂點（polyline 自動縫合）
- [ ] 1.4 拖曳頂點：pointerdown 選中 → pointermove 更新座標 → pointerup 確認，即時重繪
- [ ] 1.5 雙擊線段：在最近的線段上插入新頂點
- [ ] 1.6 點擊線段（非頂點）：高亮該線段兩端，按 Delete 刪除其中一個端點

## 2. DrawingLayer 高亮渲染

- [ ] 2.1 DrawingLayer.render() 接受 highlightInfo 參數：{ hoveredEdgeIndex, selectedVertexIndex, shapeId }
- [ ] 2.2 高亮的線段用紅色粗線繪製
- [ ] 2.3 選中的頂點用黃色大圓繪製
- [ ] 2.4 hover 的頂點用橙色圓繪製

## 3. Wizard 接入

- [ ] 3.1 步驟 3「微調」按鈕改為啟用 EditContourTool（不是 PolylineTool）
- [ ] 3.2 微調模式下底部顯示操作提示：「點擊頂點選取 → Delete 刪除 | 拖曳移動 | 雙擊線段新增點」
- [ ] 3.3 「完成微調」按鈕退出編輯模式

## 4. 測試

- [ ] 4.1 E2E：上傳照片 → AI 輪廓 → 微調（刪點、移點）→ 確認 → 匯出驗證
