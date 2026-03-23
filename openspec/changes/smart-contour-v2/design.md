## Context

目前輪廓偵測管線（`autoAnalyze.ts` + `contour.ts`）以 Layer 0 FastSAM → Layer 1 Gemini 作為 fallback 架構，但存在三個問題：

1. **fastsam_segment.py 缺乏品質驗證**：模型遺失時回傳 `fastsam_unavailable`，但在模型存在、推論成功的情況下，若輸出點數過少（如凸包只有 3 個點）仍被 `contour.ts` 接受（`filter(c => c.contour_px.length >= 3)`）。沒有面積比上限。

2. **Gemini fallback 使用 crop + 2 calls**：`detectContourWithGemini` 呼叫 `cropImageWithPython`（需要 `crop_image.py`）裁切圖片，再把裁切後圖片送給 Gemini。流程為：spawn Python crop → 寫暫存檔 → call Gemini。實際上 Gemini 可以透過 prompt 文字描述 bbox 位置，不需要裁切。

3. **autoAnalyze.ts 無品質閘門**：管線只判斷 `fastSamResult.found && contours.length > 0`，不驗證輪廓是否合理（點數是否足夠、是否把整張圖都圍起來）。

執行環境：Node.js server（Raspberry Pi 4 或 x64 Linux），Python 3.11+，ultralytics 已安裝，FastSAM-s.pt 已存在於 script 同目錄。

## Goals / Non-Goals

**Goals:**
- 定義統一的品質閘門函式，供管線各層共用
- 品質條件：`contour_px.length >= 6` AND `area_ratio(contour, bbox) <= 0.85`
- 將 `detectContourWithGemini` 改為單次 Gemini call，bbox 以 prompt 文字描述
- fastsam_segment.py 加入模型自動下載（使用 ultralytics hub 的 `attempt_download_asset`），以及明確的點數品質驗證
- 移除 `crop_image.py` 與 `contour.ts` 中的 `cropImageWithPython` 邏輯
- SSE `contour-update` 只在通過品質閘門後才發送

**Non-Goals:**
- 不改動 web-calibration（Phase 2，`web_calibrate.py`）流程
- 不改動前端輪廓顯示或 SSE 事件格式
- 不引入新的 Python 依賴（只用 ultralytics 已有的工具）
- 不對 Layer 2（OpenCV edge detection）做任何修改

## Decisions

### D1：品質閘門放在 `autoAnalyze.ts` 還是 `contour.ts`？

放在 **`autoAnalyze.ts`**（管線編排層）。

理由：`contour.ts` 的函式只負責偵測並回傳結果，品質判斷是管線策略。把閘門放在 `autoAnalyze.ts` 讓兩個函式保持可獨立測試，也避免 `contour.ts` 因為需要 `bboxResult` 才能算面積比而增加耦合。

替代方案：在 `contour.ts` 內部過濾 → 否決，因為需要傳入 bbox 才能算面積比，增加介面複雜度。

### D2：面積比計算使用 bbox 面積還是全圖面積？

使用 **bbox 面積**（`bboxResult.width * bboxResult.height`）。

理由：全圖面積無法排除「bbox 本來就很大、物件貼合 bbox」的合理情況。若 `bboxResult` 不存在，fallback 到全圖面積比上限（proposal 定義的 > 0.85 拒絕）。面積比計算使用 Shoelace 公式或外接矩形近似（實作選擇外接矩形，效能優先）。

### D3：Gemini bbox hint 怎麼放進 prompt？

在既有 prompt 文字最前面加一段中性說明，格式：

```
The main object is approximately at pixel region x=X1..X2, y=Y1..Y2 in the full image (top-left origin).
```

保留完整圖片送出，讓 Gemini 自行參考 bbox 範圍描繪輪廓，回傳座標仍是全圖座標，不需要 offsetX/Y 轉換。

替代方案：維持裁切 → 否決（需要 crop_image.py，增加依賴，且帶來 offset 計算風險）。

### D4：fastsam_segment.py 模型自動下載策略

使用 **ultralytics 內建的 `checks.check_file`**（v8 API），傳入模型名稱 `"FastSAM-s.pt"` 時 ultralytics 會自動從官方 hub 下載到 user cache 目錄（`~/.cache/ultralytics/`）。

實作：`resolve_model_path` 找不到本地檔案時，呼叫 `check_file("FastSAM-s.pt")` 並以回傳路徑繼續執行。若 ultralytics 版本不支援，fallback 到 `fastsam_unavailable`。

替代方案：手動 `requests.get` 下載 → 否決（需要處理版本、URL 變更，ultralytics 自己管理更穩定）。

## Risks / Trade-offs

- **[Risk] 模型自動下載在離線環境失敗** → Mitigation：下載失敗時 catch exception，回傳 `fastsam_unavailable`，讓管線正常 fallback 到 Gemini。
- **[Risk] Gemini bbox hint 對部分模型效果不穩定** → Mitigation：品質閘門會在 Gemini 回傳爛輪廓時拒絕，目前無 Layer 2 fallback（但不在此次範圍內，保留原有 `emit('contour', 'done', { contours: [], method: 'none' })` 行為）。
- **[Trade-off] 品質閘門面積計算使用外接矩形近似** → 比 Shoelace 公式快，但對凹多邊形會高估面積 → 閘門偏寬鬆，寧可放行合理的凸輪廓，避免誤拒。
- **[Risk] 刪除 crop_image.py 後若有其他呼叫者** → 搜尋確認只有 `contour.ts` 使用 `CROP_SCRIPT_PATH`，無其他參考。

## Migration Plan

1. 刪除 `crop_image.py`
2. 修改 `fastsam_segment.py`（加 auto-download + 品質驗證輸出）
3. 修改 `contour.ts`（移除 cropImageWithPython、改 Gemini prompt）
4. 修改 `autoAnalyze.ts`（加品質閘門，改 SSE 發送邏輯）
5. 本地測試：上傳 L390 鍵盤照片，確認 FastSAM 路徑正常；關閉 ultralytics 環境確認 fallback 到 Gemini
6. 無 DB migration、無 API 格式變更，可直接部署

## Open Questions

- 若 `bboxResult` 不存在，Gemini prompt 不包含 bbox hint，此時直接使用 `CONTOUR_PROMPT_FULL`（全圖模式）——這是否需要獨立的品質閘門閾值？（目前沿用相同閾值，等觀察再調整）
