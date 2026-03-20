## Why

E2E 測試揭露前端 store（scale、drawings、dimensions、features）全部只在記憶體，export 從 DB 讀到空資料。measurement.json 匯出結果全是空陣列。

## What Changes

- **Export endpoint 改為接受前端 store 資料**：POST body 帶上完整的 photos state（scale, drawings, dimensions, features），server 直接用這些資料跑 fusion 生成 JSON，不再從 DB 讀
- **Scale 確認後同步 DB**：PATCH photo 的 scale_data（已有 API，前端沒呼叫）
- **SSE auto-analyze 結果正確帶入 store**：ruler 結果要存為 scale，contour 結果要存為 drawing

## Capabilities

### New Capabilities
- `client-export`: Export 時前端打包 store 資料送 server

### Modified Capabilities
- `json-export`: Export endpoint 改為接受 POST body 裡的 store 資料
- `scale-calibration`: 確認 scale 後同步到 DB

## Impact

- Server: export route 改為讀 POST body
- Client: export 按鈕送 store 資料、scale 確認後 PATCH API
