## Why

使用者無法直覺地拖曳移動照片，目前只能用 Space+拖曳 或滑鼠中鍵拖曳來平移，不夠直覺。3D 預覽雖已有 OrbitControls，但缺乏統一的按鍵組合規範。需要統一照片區和 3D 預覽區的滑鼠操控方式，讓操作更直覺。

## What Changes

- **照片 canvas 新增 Ctrl+左鍵拖曳平移**：在 PhotoLayer 的 pan 觸發條件中加入 Ctrl+左鍵，與現有 Space+拖曳、中鍵拖曳並存
- **3D 預覽配置 OrbitControls 按鍵映射**：左鍵拖曳 = 旋轉（orbit），Ctrl+左鍵拖曳 = 平移（pan）
- **繪圖工具避讓**：當 Ctrl 按下時，繪圖工具不處理 click/pointerdown 事件，避免誤觸

## Capabilities

### New Capabilities
- `canvas-pan-controls`: 照片 canvas 支援 Ctrl+左鍵拖曳平移，統一滑鼠操控體驗
- `3d-orbit-controls`: 3D 預覽區統一滑鼠按鍵映射（左鍵旋轉、Ctrl+左鍵平移）

### Modified Capabilities

(無)

## Impact

- **PhotoLayer.ts**：pan 觸發邏輯新增 Ctrl 鍵偵測
- **CadPreview.ts**：OrbitControls 配置按鍵映射
- **各繪圖工具**（PolylineTool, EditContourTool, ScaleTool 等）：新增 Ctrl 鍵避讓邏輯
- **無 API 變更、無資料庫變更**
