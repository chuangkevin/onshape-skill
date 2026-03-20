## Why

OpenCV 自動偵測的輪廓包含背景雜訊（桌面、尺規、手寫字），使用者需要能修剪掉不要的線段並調整頂點位置。目前「微調」按鈕切換到 PolylineTool 是從頭畫，沒有編輯現有輪廓的能力。

## What Changes

- **新增 EditContourTool**：專門編輯已有的 polyline 頂點
  - Hover 線段高亮（紅色）
  - 點擊線段刪除其端點 → 自動縫合
  - 拖曳頂點移動位置
  - 雙擊線段新增頂點
  - Delete 鍵刪除選中的頂點
- **Wizard 步驟 3「微調」改用 EditContourTool**（不再切到 PolylineTool）
- **DrawingLayer 支援高亮渲染**：特定線段/頂點用不同顏色

## Capabilities

### New Capabilities
- `contour-edit-tool`: 輪廓頂點編輯工具

### Modified Capabilities
- `overlay-drawing`: DrawingLayer 支援 hover 高亮
- `wizard-confirm-flow`: 步驟 3 微調改用 EditContourTool

## Impact

- Client: 新增 EditContourTool.ts、DrawingLayer 增加高亮渲染、Wizard 步驟 3 改接
