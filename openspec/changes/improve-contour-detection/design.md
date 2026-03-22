## Context

現有架構：`autoAnalyze.ts` 編排 Phase 1（Gemini: ruler + bbox + labels 並行）和 Phase 2（OpenCV: 邊緣檢測），透過 SSE 串流結果到前端。

Phase 2 問題：
- `detectEdges()` 呼叫 Python `edge_detect.py`，使用 Canny(50,150) + 面積過濾(0.1%)
- 對低對比度物體（電池、黑色零件）效果極差
- Bbox 偵測失敗時，全圖檢測更容易被背景噪聲干擾

業界調研結論：
- **Gemini 2.5** 原生支援多邊形分割，可直接回傳座標 JSON（範圍 [0,1000]）
- **Grounded SAM 2** 精度最高但需 GPU
- **OpenCV** 適合作為後處理工具，不適合作為主要偵測方式

## Goals / Non-Goals

**Goals:**
- Gemini 2.5 多邊形分割作為主要輪廓偵測方式
- OpenCV 改進參數作為備選（Gemini 失敗或額度用完時）
- 三層 fallback 確保穩健性
- 輪廓結果格式向下相容（`contours[].contour_px`）

**Non-Goals:**
- 不引入 SAM 2（需 GPU，部署在 RPi 4 不現實）
- 不改變 SSE 協議格式（只新增 `method` 欄位）
- 不改變前端渲染邏輯

## Decisions

### 1. Gemini 多邊形分割 Prompt 設計

**決定**：新增 `detectContourWithGemini()` 函數，使用專門的 prompt 要求 Gemini 回傳物件輪廓的像素座標點陣列。

**Prompt 策略**：
```
分析照片中的主要零件/物件（不是尺規、不是背景）。
回傳物件的外輪廓，以像素座標點陣列表示。
座標原點 (0,0) 在圖片左上角，x 向右，y 向下。

回傳 JSON：
{
  "found": true,
  "contours": [{
    "label": "laptop battery",
    "contour_px": [{"x": 100, "y": 50}, {"x": 800, "y": 50}, ...]
  }]
}
```

**替代方案**：使用 Gemini 的 [0,1000] 正規化座標格式。
**否決原因**：需要額外轉換為像素座標，且現有前端已用像素座標。直接要求像素座標更簡單，Gemini 2.5 能準確推斷圖片尺寸。

### 2. 三層 Fallback 流程

**決定**：重構 Phase 2 為序列嘗試：

```
Phase 2a: detectContourWithGemini()
  ↓ 失敗（API 錯誤、額度用完、回傳 found:false）
Phase 2b: detectEdges()（改進參數的 OpenCV）
  ↓ 失敗（無輪廓、面積太小）
Phase 2c: emit 'contour' 'done' { contours: [], method: 'none' }
  → 前端顯示「未偵測到輪廓，請手動描繪」
```

**替代方案**：並行執行 Gemini + OpenCV，取較好結果。
**否決原因**：浪費 API 額度，且大多數情況 Gemini 結果更好。序列嘗試更經濟。

### 3. OpenCV 參數改進

**決定**：
- Canny 閾值從 (50, 150) 降為 (30, 100)
- 最小面積從 0.1% 降為 0.01%
- Dilate kernel 從 3×3 擴大到 5×5
- 新增 CLAHE 對比度增強預處理

### 4. 結果格式保持一致

**決定**：無論用哪種方法偵測，回傳格式都是：
```json
{
  "contours": [{ "contour_px": [...], "area": ..., "bbox": ... }],
  "method": "gemini" | "opencv" | "none",
  "image_width": ...,
  "image_height": ...
}
```

前端不需修改，只需確保 `contours[0].contour_px` 存在即可。

## Risks / Trade-offs

- **Gemini 多邊形精度**：像素座標可能有 5-10px 偏差 → 可接受，使用者可微調
- **Gemini 額度消耗**：新增一次 API 呼叫 → 用獨立的 key 分配，不與 ruler/bbox/labels 衝突
- **OpenCV 改進可能產生噪聲**：降低閾值增加假陽性 → CLAHE 預處理 + 面積過濾可控制
- **RPi 4 部署**：不引入 SAM 避免 GPU 需求 → Gemini API + 輕量 OpenCV 足夠
