## ADDED Requirements

### Requirement: 首次使用選擇
首次開啟應用程式時，系統 SHALL 顯示模式選擇畫面，提供「引導模式」與「自由模式」兩個選項供使用者選擇。

#### Scenario: 首次開啟顯示選擇畫面
- **WHEN** 使用者首次開啟應用程式（localStorage 中無模式偏好紀錄）
- **THEN** 系統 SHALL 顯示全螢幕模式選擇畫面，包含「引導模式」與「自由模式」兩個選項及各自的說明

#### Scenario: 選擇後進入對應模式
- **WHEN** 使用者在選擇畫面點擊「引導模式」
- **THEN** 系統 SHALL 進入引導模式並開始步驟精靈流程

### Requirement: 偏好記憶
系統 SHALL 使用 localStorage 記住使用者的模式選擇，後續開啟時 MUST 自動套用上次的選擇。

#### Scenario: 記住模式偏好
- **WHEN** 使用者選擇「自由模式」後關閉應用程式
- **THEN** 再次開啟時系統 SHALL 直接進入自由模式，不再顯示選擇畫面

#### Scenario: localStorage 被清除
- **WHEN** 使用者清除瀏覽器 localStorage
- **THEN** 下次開啟時系統 SHALL 重新顯示模式選擇畫面

### Requirement: 隨時切換
系統 SHALL 在 header 區域提供模式切換元件，使用者可隨時在引導模式與自由模式之間切換。

#### Scenario: 從 header 切換模式
- **WHEN** 使用者在自由模式下點擊 header 的模式切換按鈕
- **THEN** 系統 SHALL 立即切換至引導模式，並更新 localStorage 中的偏好紀錄

#### Scenario: 切換模式保留進度
- **WHEN** 使用者在引導模式步驟 3 時切換到自由模式
- **THEN** 系統 SHALL 保留已完成步驟的資料，切回引導模式時 SHALL 從步驟 3 繼續
