## ADDED Requirements

### Requirement: 結果卡片

分析完成後，系統 SHALL 在右側面板顯示 AI 分析結果卡片，包含：型號、製造商、官方規格（長/寬/高）、OCR 讀數。每項資料 MUST 顯示來源標記（AI 偵測 / 官方規格 / OCR）。

#### Scenario: 分析完成顯示結果
- **WHEN** AI 分析完成且有辨識結果
- **THEN** 右側面板出現結果卡片，列出所有偵測到的項目

#### Scenario: 部分項目未偵測到
- **WHEN** AI 未偵測到某些項目（如製造商）
- **THEN** 該項顯示為「未偵測」並允許手動輸入

### Requirement: 確認機制

每個分析結果項目 SHALL 有確認勾選框。已確認的項目 MUST 被標記為「已確認」並帶入匯出資料。未確認的項目 SHALL 在匯出時標記為「未確認」。

#### Scenario: 確認單一項目
- **WHEN** 使用者點擊某項目的確認勾選框
- **THEN** 該項目標記為已確認，視覺樣式變更（如打勾圖示）

#### Scenario: 全部確認
- **WHEN** 使用者點擊「全部確認」按鈕
- **THEN** 所有項目標記為已確認

### Requirement: 編輯機制

數值型項目（尺寸、OCR 讀數）SHALL 支援點擊編輯。點擊編輯圖示後，數值 MUST 變為 input 欄位。失焦或按 Enter 後 SHALL 儲存修改值。

#### Scenario: 編輯數值
- **WHEN** 使用者點擊某數值項的編輯圖示
- **THEN** 數值變為可編輯的 input 欄位

#### Scenario: 儲存編輯
- **WHEN** 使用者修改數值後按 Enter 或點擊其他區域
- **THEN** 新數值被儲存，input 恢復為文字顯示
