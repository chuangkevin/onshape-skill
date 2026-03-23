## 1. 移除 crop_image.py

- [x] 1.1 刪除 `tools/measure/src/server/python/crop_image.py`
- [x] 1.2 移除 `contour.ts` 中的 `CROP_SCRIPT_PATH` 常數宣告
- [x] 1.3 移除 `contour.ts` 中的 `cropImageWithPython` 函式及其所有呼叫點
- [x] 1.4 移除 `contour.ts` 頂部 `import { unlinkSync } from 'fs'` 及 `import { tmpdir } from 'os'`（若移除 crop 後不再使用）

## 2. 修改 fastsam_segment.py：模型自動下載

- [x] 2.1 修改 `resolve_model_path`：找不到本地模型時，呼叫 `from ultralytics.utils.downloads import attempt_download_asset` 或 `from ultralytics.utils import check_file` 進行自動下載
- [x] 2.2 將自動下載包在 try/except 中，下載失敗時回傳 `None`（管線將輸出 `fastsam_unavailable`）
- [x] 2.3 更新 `resolve_model_path` 的 docstring，說明自動下載行為

## 3. 修改 fastsam_segment.py：輸出品質驗證

- [x] 3.1 在 `# --- Build output ---` 區塊（ROI 路徑與非 ROI 路徑各一），加入點數驗證：若最終 `points` 或 `hull_points` 長度 < 6，輸出 `{ "contours": [], "image_size": ... }`
- [x] 3.2 確認 ROI convex hull 路徑（`hull_points`）也套用同樣點數驗證

## 4. 修改 contour.ts：簡化 detectContourWithGemini

- [x] 4.1 移除 `CONTOUR_PROMPT_CROPPED` prompt 常數（不再裁切圖片）
- [x] 4.2 將 `detectContourWithGemini` 函式簽章保留 `roi?: ContourRoi` 參數，但改為將 bbox 座標寫入 prompt 文字（新 prompt：先輸出 bbox 位置說明再加原 `CONTOUR_PROMPT_FULL` 主體）
- [x] 4.3 移除函式內部的 `cropPath`、`imageToSend`、`offsetX`、`offsetY` 相關邏輯，始終傳送原始 `imagePath`
- [x] 4.4 移除回傳後的座標 offset 轉換（`pt.x + offsetX`），改為直接使用 Gemini 回傳的全圖座標
- [x] 4.5 更新 console.log 訊息，移除 `cropped-image` 分支輸出

## 5. 修改 autoAnalyze.ts：加入品質閘門

- [x] 5.1 新增 `isContourQualityOk` 輔助函式：接受 `contours`、`bboxResult`、`imageWidth`、`imageHeight`，回傳 boolean；點數 < 6 或面積比 > 0.85 回傳 false
- [x] 5.2 `isContourQualityOk` 面積比計算：使用外接矩形（`minX/maxX/minY/maxY`）與 bbox 面積（`bboxResult.width * bboxResult.height`）比較；`bboxResult` 不存在時改與 `imageWidth * imageHeight` 比較
- [x] 5.3 在 Layer 0（FastSAM）偵測成功後，呼叫 `isContourQualityOk`；通過才執行 `emitContourUpdate` 與 `triggerWebCalibration`，不通過則 log 並繼續嘗試 Layer 1
- [x] 5.4 在 Layer 1（Gemini）偵測成功後，同樣呼叫 `isContourQualityOk`；通過才執行 `emitContourUpdate`，不通過則 log
- [x] 5.5 取得圖片尺寸供品質閘門使用：在 `imagePath` 解析後，使用現有的 `detectContourWithFastSAM` 已有的 `image_size` 回傳值（若可取得），或透過 Node.js `sharp`（若已依賴）讀取；若都不方便，以 `bboxResult` 的 `x + width` / `y + height` 推算最小圖片尺寸作為 fallback
