## Context

現有分析管線（`autoAnalyze.ts`）：Gemini bbox ROI → OpenCV Canny → Gemini polygon fallback。OpenCV 在複雜背景下準確率不穩；Gemini polygon 只回傳粗略矩形。系統需在 Raspberry Pi 4 (4GB RAM, ARM64, CPU only) 上運作，無 GPU。

現有 SSE 架構已支援串流推送分析進度，前端 `ContourLayer.ts` 已有輪廓渲染能力。

## Goals / Non-Goals

**Goals:**
- Phase 1 FastSAM：上傳後 2-4 秒內顯示初步輪廓
- Phase 2 Web calibration：背景執行，完成後透過 SSE 推送校正輪廓替換 Phase 1
- Pi 4 可運作（FastSAM CPU 模式）
- 輪廓來源標示讓使用者知道目前精度等級

**Non-Goals:**
- 不支援 GPU 加速（Pi 4 無 GPU）
- 不做即時視訊串流分析
- Phase 2 不保證一定能找到參考圖（型號無法辨識時 graceful degradation）

## Decisions

### 1. FastSAM 而非原版 SAM

**決定**：使用 FastSAM（YOLOv8 架構，~23MB 模型）。

**理由**：原版 SAM ViT-B 在 Pi 4 CPU 需 45-90 秒；FastSAM 只需 2-4 秒，模型常駐記憶體 ~200MB，在 4GB RAM 中佔比可接受。

**替代方案**：MobileSAM（40MB，~5-10s）、EfficientSAM-Ti（35MB，~3-5s）— 三者差異不大，FastSAM 社群最活躍、文件最完整。

### 2. Phase 2 在同一 Python 進程背景執行

**決定**：Phase 2 web search + alignment 在 `edge_detect.py` 內作為獨立函數，由 Node.js `analyze.ts` 用第二個 spawn 呼叫，Phase 1 spawn 完成後立即觸發。

**理由**：避免引入 message queue；現有 spawn + SSE 架構可直接複用。Phase 2 stdout 透過 JSON lines 推送 `contour-update` 事件。

**替代方案**：Python multiprocessing — 增加複雜度，Pi 4 記憶體壓力更大。

### 3. ICP Alignment 用 scipy

**決定**：使用 `scipy.spatial.KDTree` 實作簡化 ICP（Iterative Closest Point）對多張參考圖輪廓做對齊，再取點群交集（距離 < 5px 視為共識點）。

**理由**：scipy 已是常見 Python 依賴；完整 ICP 庫（如 open3d）在 Pi 4 ARM64 安裝困難。

### 4. Gemini Grounding Search

**決定**：使用 `gemini-2.5-flash` 的 `google_search` tool（grounding），prompt 要求回傳圖片 URL 列表（規格書、拆機照、電商圖）。

**限制**：Gemini grounding 回傳的是文字描述和網頁連結，不直接回傳圖片 URL。需要進一步用 requests + BeautifulSoup 從頁面抓 `<img>` 標籤，或改用 Google Custom Search API。

**決定修正**：優先嘗試 Gemini grounding 抓網頁連結 → BeautifulSoup 抓圖片；若失敗 fallback 到不做 Phase 2（直接用 Phase 1 結果）。

### 5. SSE 新事件類型

**決定**：新增 `contour-update` SSE 事件（與現有 `progress`、`complete` 並存），payload 包含 `source`（`fastsam` / `web-calibrated`）和 `contours`。

前端收到 `contour-update` 時替換輪廓並更新來源標籤，不重置 wizard 步驟。

## Risks / Trade-offs

- **FastSAM 模型首次下載**：~23MB，需要網路。→ Dockerfile 預先 `python -c "from ultralytics import FastSAM; FastSAM('FastSAM-s.pt')"` 下載並快取
- **Phase 2 找不到圖片**：型號辨識失敗或網頁無圖。→ Graceful degradation：Phase 1 結果保持，UI 顯示「無法取得參考圖，使用本地分析結果」
- **ICP 對齊失敗**：參考圖角度差異過大。→ 設定 inlier ratio 閾值（>60% 點對齊才採用），否則放棄此張參考圖
- **Gemini grounding 費用**：每次 Phase 2 搜尋約 1-2 次 API 呼叫。→ 結果快取（同型號 24h），避免重複搜尋

## Migration Plan

1. 新增 `fastsam_segment.py`（Phase 1），獨立於現有 `edge_detect.py`
2. 新增 `web_calibrate.py`（Phase 2）
3. 修改 `autoAnalyze.ts`：Phase 1 優先，OpenCV 降為備援
4. 修改 SSE 前端處理：支援 `contour-update` 事件
5. 更新 `Dockerfile`：安裝 ultralytics + scipy + beautifulsoup4，預下載 FastSAM 模型
6. Rollback：若 FastSAM 失敗（import error），自動 fallback 到現有 OpenCV 管線

## Open Questions

- Gemini grounding 是否穩定回傳可用圖片連結？需實測。
- FastSAM 在 Pi 4 實際推論時間（目前估算基於 benchmark，非實測）。
