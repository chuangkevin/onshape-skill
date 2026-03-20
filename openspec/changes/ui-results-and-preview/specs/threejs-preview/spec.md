## ADDED Requirements

### Requirement: 3D 擠出預覽

系統 SHALL 使用 Three.js 將 contour_mm 座標擠出成 3D 模型，擠出厚度取自 caliper_readings 的「厚度」值，若無則預設 5mm。模型 MUST 使用半透明灰色材質搭配線框 overlay。

#### Scenario: 基本輪廓擠出
- **WHEN** 使用者點擊「預覽 CAD 模型」且 contour_mm 資料存在
- **THEN** 系統開啟預覽 modal，顯示由輪廓擠出的 3D 模型

#### Scenario: 無輪廓資料
- **WHEN** 使用者點擊「預覽 CAD 模型」但 contour_mm 為空
- **THEN** 按鈕為禁用狀態，無法開啟預覽

### Requirement: 旋轉縮放

預覽 SHALL 支援 OrbitControls，使用者可用滑鼠拖曳旋轉、滾輪縮放。觸控裝置 MUST 支援雙指縮放與單指旋轉。

#### Scenario: 滑鼠旋轉
- **WHEN** 使用者在預覽 modal 中按住左鍵拖曳
- **THEN** 3D 模型隨滑鼠方向旋轉

#### Scenario: 滾輪縮放
- **WHEN** 使用者在預覽 modal 中滾動滾輪
- **THEN** 相機拉近或拉遠

### Requirement: 尺寸標註

預覽 SHALL 使用 CSS2DRenderer 顯示長、寬、高的尺寸標註（單位 mm）。標註 MUST 隨模型旋轉同步移動。

#### Scenario: 顯示標註
- **WHEN** 預覽 modal 開啟且模型已載入
- **THEN** 模型旁顯示長、寬、高的 mm 標註文字

### Requirement: 孔位顯示

如 measurement 資料包含 circle features，系統 SHALL 使用 Shape.holes 在擠出模型上挖孔。

#### Scenario: 有圓孔特徵
- **WHEN** measurement 資料含有 circle features
- **THEN** 3D 模型上對應位置顯示圓孔

#### Scenario: 無圓孔特徵
- **WHEN** measurement 資料無 circle features
- **THEN** 3D 模型為完整實體，無孔位
