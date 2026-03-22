## ADDED Requirements

### Requirement: Ctrl+左鍵拖曳平移照片
使用者在照片 canvas 上按住 Ctrl 鍵並用滑鼠左鍵拖曳時，系統 SHALL 平移照片視圖，與現有 Space+拖曳和中鍵拖曳行為一致。

#### Scenario: Ctrl+左鍵拖曳平移照片
- **WHEN** 使用者在照片 canvas 上按住 Ctrl 鍵並按下滑鼠左鍵拖曳
- **THEN** 照片 SHALL 隨滑鼠移動方向平移，游標 SHALL 變為 grabbing

#### Scenario: 放開 Ctrl 或滑鼠後停止平移
- **WHEN** 使用者放開 Ctrl 鍵或滑鼠左鍵
- **THEN** 平移 SHALL 停止，游標 SHALL 恢復為 crosshair

#### Scenario: 現有 pan 方式不受影響
- **WHEN** 使用者使用 Space+拖曳或中鍵拖曳
- **THEN** 平移行為 SHALL 與修改前完全一致

### Requirement: 繪圖工具在 Ctrl 按下時不觸發
當 Ctrl 鍵按下時，所有繪圖工具 SHALL 忽略 click/pointerdown 事件，讓事件穿透到 pan handler。

#### Scenario: Ctrl+click 不新增繪圖點
- **WHEN** 使用者在多邊形工具啟用時按住 Ctrl 並點擊 canvas
- **THEN** 系統 SHALL 不新增繪圖點，SHALL 開始平移照片

#### Scenario: 不按 Ctrl 時繪圖工具正常運作
- **WHEN** 使用者不按 Ctrl 直接點擊 canvas
- **THEN** 繪圖工具 SHALL 正常處理事件（如新增點、選取等）
