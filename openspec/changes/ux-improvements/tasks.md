## 1. Python 路徑修復

- [x] 1.1 修改 opencv.ts checkPython()：依序嘗試 PYTHON_PATH env → where/which 取完整路徑 → 常見路徑 fallback
- [x] 1.2 快取偵測到的完整路徑，啟動時 console.log 輸出
- [x] 1.3 修改 edge_detect.py：處理前 resize 到最長邊 1024px，輸出座標按比例換算回原尺寸
- [ ] 1.4 測試：Windows 環境 + 模擬 Docker 環境路徑偵測

## 2. 模式選擇器

- [x] 2.1 建立模式選擇 UI（首次使用全螢幕 overlay：引導模式 / 自由模式）
- [x] 2.2 localStorage 偏好記憶（measureMode = wizard | free）
- [x] 2.3 Header 加入模式切換按鈕（引導 ↔ 自由）
- [ ] 2.4 測試：首次顯示選擇、記住偏好、切換模式

## 3. Wizard 引導模式

- [x] 3.1 建立 WizardOverlay 元件：步驟條（①②③④⑤）+ 說明面板 + 導航按鈕
- [x] 3.2 步驟 1：上傳照片（拖曳區 + 說明文字）
- [x] 3.3 步驟 2：校準比例尺（自動啟動 ScaleTool + 圖示說明）
- [x] 3.4 步驟 3：描繪輪廓（先跑 auto-contour，再讓使用者微調）
- [x] 3.5 步驟 4：標記特徵（選填，可跳過）
- [x] 3.6 步驟 5：AI 分析 + 匯出（一鍵觸發，顯示進度）
- [x] 3.7 完成步驟時顯示確認動畫（綠勾 + 自動滑到下一步）
- [x] 3.8 上一步/跳過/下一步按鈕邏輯
- [ ] 3.9 測試：Wizard 完整流程 E2E

## 4. SSE 即時分析

- [x] 4.1 建立 GET /api/projects/:id/analyze-stream SSE endpoint
- [x] 4.2 拆分 analyze pipeline 為獨立步驟，每步完成發送 SSE event
- [x] 4.3 並行群組：[ocr, labels, opencv] 同時 → search 等 labels → fusion 等全部
- [x] 4.4 前端 EventSource 接收 + 進度面板 UI（每個子任務：等待/進行中/完成/失敗）
- [x] 4.5 30 秒逾時處理（前端 + 後端）
- [ ] 4.6 測試：SSE 連線、進度更新、逾時、錯誤處理

## 5. 多照片 Views 綁定

- [x] 5.1 前端照片列表加入角度圖示（俯/側/正/背/特寫 icon）
- [x] 5.2 校準比例尺後詢問「套用到所有照片？」
- [x] 5.3 API: PATCH /api/projects/:id/apply-scale 套用比例尺到所有照片
- [x] 5.4 匯出 JSON 時合併所有 Views 到同一份 measurement.json
- [ ] 5.5 測試：共用比例尺、個別覆蓋、多 View 匯出

## 6. Docker 部署（RPi 4）

- [x] 6.1 建立 Dockerfile（ARM64, Node.js 22 + Python 3 + opencv-python）
- [x] 6.2 建立 docker-compose.yml（port mapping, volume mount for data/）
- [x] 6.3 設定 PYTHON_PATH=/usr/bin/python3 環境變數
- [ ] 6.4 測試：docker build + docker-compose up 在 ARM64 環境
