## ADDED Requirements

### Requirement: 3D 預覽左鍵旋轉視角
在 3D 預覽區域，使用者用滑鼠左鍵拖曳時，系統 SHALL 旋轉 3D 模型的視角（orbit）。

#### Scenario: 左鍵拖曳旋轉
- **WHEN** 使用者在 3D 預覽 canvas 上按下左鍵並拖曳
- **THEN** 3D 視角 SHALL 圍繞模型中心旋轉，帶有慣性阻尼效果

### Requirement: 3D 預覽 Ctrl+左鍵平移
在 3D 預覽區域，使用者按住 Ctrl 並用左鍵拖曳時，系統 SHALL 平移 3D 場景（pan）。

#### Scenario: Ctrl+左鍵拖曳平移
- **WHEN** 使用者在 3D 預覽 canvas 上按住 Ctrl 並用左鍵拖曳
- **THEN** 3D 場景 SHALL 沿滑鼠移動方向平移

#### Scenario: 滾輪縮放不受影響
- **WHEN** 使用者在 3D 預覽 canvas 上滾動滑鼠滾輪
- **THEN** 3D 視角 SHALL 前進/後退（dolly zoom），行為與修改前一致
