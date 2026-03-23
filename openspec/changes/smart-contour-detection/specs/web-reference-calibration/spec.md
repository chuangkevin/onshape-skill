## ADDED Requirements

### Requirement: Gemini web search 抓取參考圖
系統 SHALL 在 Phase 1 輪廓推送後，啟動 Phase 2：使用 Gemini grounding search 根據 OCR 識別出的型號搜尋官方規格圖或拆機照，抓取至少 2 張可用圖片 URL。

#### Scenario: 成功找到參考圖
- **WHEN** OCR 識別出型號（如 L17C3P53），且 Gemini search 回傳包含圖片的網頁連結
- **THEN** 系統下載至少 2 張圖片，進入 ICP alignment 流程

#### Scenario: 型號無法辨識
- **WHEN** OCR 未找到可辨識的型號字串
- **THEN** 系統跳過 Phase 2，保持 Phase 1 輪廓，UI 顯示「無法辨識型號，跳過 Web 校正」

#### Scenario: 搜尋結果無可用圖片
- **WHEN** Gemini search 有結果但頁面中無可抓取的圖片 URL
- **THEN** 系統跳過 Phase 2，Phase 1 輪廓保持

### Requirement: 多圖 ICP 輪廓對齊取交集
系統 SHALL 對抓到的每張參考圖各自做輪廓偵測（OpenCV Canny），再用 ICP alignment 對齊所有輪廓，取共識點（inlier ratio ≥ 60%）輸出高置信度輪廓。

#### Scenario: ICP 對齊成功
- **WHEN** 至少 2 張參考圖輪廓對齊後 inlier ratio ≥ 60%
- **THEN** 系統透過 SSE 推送 `{ type: "contour-update", source: "web-calibrated", contours: [...] }` 替換 Phase 1 輪廓

#### Scenario: ICP 對齊失敗（角度差異過大）
- **WHEN** 參考圖角度差異過大，inlier ratio < 60%
- **THEN** 放棄此張參考圖，若所有圖都失敗則保持 Phase 1 輪廓

### Requirement: 型號搜尋結果快取
系統 SHALL 快取同型號的 Phase 2 搜尋結果（包含圖片 URL 和對齊後輪廓），快取 TTL 為 24 小時，避免重複呼叫 Gemini API。

#### Scenario: 同型號第二次分析
- **WHEN** 使用者分析同一型號的不同照片
- **THEN** 系統直接使用快取的參考輪廓做 ICP alignment，跳過 web search 步驟

### Requirement: Phase 2 背景執行不阻塞 UI
系統 SHALL 以背景方式執行 Phase 2，Phase 1 結果推送後 UI 立即可用（使用者可繼續操作），Phase 2 完成時才推送 `contour-update` 替換輪廓。

#### Scenario: Phase 2 執行期間使用者操作輪廓
- **WHEN** Phase 2 尚在執行中，使用者手動編輯了 Phase 1 輪廓
- **THEN** Phase 2 完成後系統詢問是否用 Web 校正結果替換（不強制覆蓋）
