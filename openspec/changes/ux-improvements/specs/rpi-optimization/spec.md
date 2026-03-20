## ADDED Requirements

### Requirement: 照片 resize
OpenCV 處理前，系統 SHALL 將照片 resize 到最長邊不超過 1024px，等比例縮放，以降低 RPi 4 的運算負擔。

#### Scenario: 大圖 resize
- **WHEN** 輸入照片解析度為 4032x3024
- **THEN** 系統 SHALL 將照片 resize 為 1024x768（最長邊 1024px，等比例縮放）後再交給 OpenCV 處理

#### Scenario: 小圖不 resize
- **WHEN** 輸入照片解析度為 800x600（最長邊小於 1024px）
- **THEN** 系統 SHALL 維持原始解析度，不進行 resize

### Requirement: 座標換算
resize 後由 OpenCV 偵測到的座標，系統 SHALL 按原始與 resize 後的比例換算回原始尺寸的座標。

#### Scenario: 座標比例換算
- **WHEN** 原始圖片為 4032x3024，resize 為 1024x768，OpenCV 偵測到座標 (512, 384)
- **THEN** 系統 SHALL 將座標換算為 (2016, 1512)，換算比例為 4032/1024 = 3.9375

#### Scenario: 未 resize 的座標
- **WHEN** 圖片未經 resize（原始尺寸小於 1024px）
- **THEN** 系統 SHALL 直接使用 OpenCV 回傳的原始座標，不進行換算

### Requirement: Dockerfile
專案 SHALL 提供 ARM64 架構的 Dockerfile，MUST 包含 Node.js、Python 3、OpenCV 執行環境。

#### Scenario: ARM64 建置
- **WHEN** 在 RPi 4（ARM64）上執行 docker build
- **THEN** Dockerfile SHALL 成功建置映像，包含 Node.js 20.x、Python 3.11+、OpenCV 4.x

#### Scenario: 映像大小限制
- **WHEN** 建置完成
- **THEN** 最終映像大小 SHALL 不超過 2GB（使用 multi-stage build 精簡）

### Requirement: Python 路徑偵測
系統 SHALL 依序嘗試以下方式偵測 Python 執行檔路徑：PYTHON_PATH 環境變數、which/where 指令、常見安裝路徑。

#### Scenario: 使用環境變數
- **WHEN** PYTHON_PATH 環境變數設定為 /usr/local/bin/python3
- **THEN** 系統 SHALL 使用 /usr/local/bin/python3 作為 Python 路徑，不再嘗試其他偵測方式

#### Scenario: 環境變數未設定，使用 which
- **WHEN** PYTHON_PATH 環境變數未設定，且 which python3 回傳 /usr/bin/python3
- **THEN** 系統 SHALL 使用 /usr/bin/python3 作為 Python 路徑

#### Scenario: 所有偵測方式皆失敗
- **WHEN** PYTHON_PATH 未設定、which/where 找不到、常見路徑皆不存在
- **THEN** 系統 SHALL 拋出明確錯誤訊息：「找不到 Python 執行檔，請設定 PYTHON_PATH 環境變數」
