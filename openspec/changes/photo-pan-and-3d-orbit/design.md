## Context

PhotoLayer 目前支援兩種 pan 方式：Space+拖曳、滑鼠中鍵拖曳。3D 預覽用 Three.js OrbitControls 預設配置（左鍵 orbit、右鍵 pan、滾輪 zoom）。

現有程式碼的 pan 狀態管理：
- `PhotoLayer.isPanningNow` getter 供繪圖工具檢查
- 各工具在 pointerdown/click 時檢查 `isPanningNow`，若為 true 則忽略事件
- `photoLayer.attachEvents(drawingCanvas)` 將 pan/zoom 事件掛在 drawingCanvas 上

## Goals / Non-Goals

**Goals:**
- Ctrl+左鍵拖曳可平移照片（與現有 Space+拖曳、中鍵拖曳並存）
- 3D 預覽：左鍵拖曳旋轉、Ctrl+左鍵拖曳平移
- 繪圖工具在 Ctrl 按下時不觸發

**Non-Goals:**
- 不移除現有的 Space+拖曳和中鍵拖曳功能
- 不改變滾輪 zoom 行為
- 不改變 3D 預覽的滾輪 zoom

## Decisions

### 1. PhotoLayer pan 觸發條件擴充

**決定**：在 `pointerdown` handler 中，除了現有的 `spaceDown || e.button === 1` 判斷，新增 `e.ctrlKey && e.button === 0` 條件。

**理由**：最小改動，複用現有 pan 邏輯（offset 計算、cursor 變化、transform-change 事件），不需要新的 state machine。

### 2. OrbitControls 按鍵配置

**決定**：設定 OrbitControls 的按鍵映射：
```js
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
// Ctrl+左鍵 = pan（OrbitControls 內建支援）
```

Three.js OrbitControls **內建** Ctrl+左鍵 = pan 的功能（當 `enablePan = true`），只需確保未被覆蓋。

### 3. 繪圖工具 Ctrl 避讓

**決定**：在各工具的 event handler 開頭加入 `if (e.ctrlKey) return;` 檢查，讓 Ctrl+click 事件穿透到底層的 PhotoLayer pan handler。

**替代方案**：在 PhotoLayer 中 stopPropagation 阻止事件傳遞到工具。
**否決原因**：PhotoLayer 的 pan 事件已經 stopPropagation，但 Ctrl+click 需要在 pointerdown 時就攔截，且各工具用不同事件類型（click vs pointerdown），統一在工具層判斷更可靠。

## Risks / Trade-offs

- **Ctrl 鍵衝突**：瀏覽器 Ctrl+click 可能有預設行為（如新分頁開啟連結）→ 在 canvas 上 `e.preventDefault()` 阻止
- **觸控裝置**：Ctrl 鍵在觸控裝置不存在 → 不影響，Space+拖曳和中鍵拖曳仍可用
