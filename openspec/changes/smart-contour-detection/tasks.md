## 1. FastSAM Python 整合

- [ ] 1.1 新增 `src/server/python/fastsam_segment.py`：載入 FastSAM-s 模型，接收圖片路徑 + bbox ROI（可選），回傳 JSON `{ contours: [[x,y],...], confidence: float }`
- [ ] 1.2 `fastsam_segment.py` 加入 fallback：`ImportError` 時輸出 `{ error: "fastsam_unavailable" }` 而非 crash
- [ ] 1.3 `fastsam_segment.py` 支援 CLI 參數：`--image <path> --roi <x1,y1,x2,y2>`（ROI 可省略）
- [ ] 1.4 本地測試：`python fastsam_segment.py --image test.jpg` 可執行（有/無 ultralytics 兩種情況）

## 2. Phase 2 Web Calibration Python

- [ ] 2.1 新增 `src/server/python/web_calibrate.py`：接收型號字串，呼叫 Gemini grounding search，取回網頁連結列表
- [ ] 2.2 `web_calibrate.py` 加入 BeautifulSoup 圖片抓取：從網頁連結中提取 `<img>` src，過濾小圖（< 200px）
- [ ] 2.3 `web_calibrate.py` 對每張參考圖用 OpenCV Canny 偵測輪廓
- [ ] 2.4 `web_calibrate.py` 實作 ICP alignment：`scipy.spatial.KDTree` 對齊多圖輪廓，inlier ratio ≥ 60% 才採用
- [ ] 2.5 `web_calibrate.py` 支援 CLI 參數：`--model-id <string> --output-json`，stdout 輸出 JSON lines

## 3. Node.js 分析管線整合

- [ ] 3.1 修改 `src/server/services/contour.ts`：新增 `detectContourWithFastSAM()` 函數，spawn `fastsam_segment.py`，解析輸出
- [ ] 3.2 修改 `src/server/routes/analyze.ts`：Phase 1 用 FastSAM，失敗時 fallback OpenCV，透過 SSE 推送 `{ type: "contour-update", source: "fastsam", contours }`
- [ ] 3.3 修改 `src/server/routes/analyze.ts`：Phase 1 完成後，非同步觸發 Phase 2（spawn `web_calibrate.py`），Phase 2 輸出透過同一 SSE 連線推送 `{ source: "web-calibrated" }`
- [ ] 3.4 新增 SSE 事件類型 `contour-update`，區別於現有 `progress`/`complete` 事件
- [ ] 3.5 Phase 2 快取：以型號為 key，SQLite `web_calibration_cache` 表存放輪廓 JSON + timestamp，TTL 24h

## 4. 前端 ContourLayer 更新

- [ ] 4.1 修改 `src/client/canvas/ContourLayer.ts`（或對應 SSE handler）：監聽 `contour-update` 事件，替換現有輪廓
- [ ] 4.2 新增輪廓來源標籤 UI：在 canvas 角落或工具列顯示「FastSAM」/「Web 校正」/「OpenCV」
- [ ] 4.3 Phase 2 完成且使用者已手動編輯輪廓時，顯示確認對話框「是否以 Web 校正結果替換？」

## 5. Docker 更新

- [ ] 5.1 修改 `Dockerfile`：`pip install ultralytics scipy beautifulsoup4 requests`
- [ ] 5.2 修改 `Dockerfile`：build 時預下載 FastSAM-s 模型到 `/app/models/FastSAM-s.pt`
- [ ] 5.3 驗證 Docker image 在 ARM64 可正確 build（`docker buildx build --platform linux/arm64`）

## 6. 測試驗證

- [ ] 6.1 Build 成功（`vite build` + `tsc -p tsconfig.server.json` 無錯誤）
- [ ] 6.2 E2E 測試無回歸
- [ ] 6.3 手動測試：上傳 L390 電池照片 → Phase 1 在 4 秒內顯示 FastSAM 輪廓
- [ ] 6.4 手動測試：Phase 2 完成後輪廓自動更新，來源標籤變為「Web 校正」
- [ ] 6.5 手動測試：無 ultralytics 時 fallback 到 OpenCV 正常運作
