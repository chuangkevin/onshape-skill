# Fix CD Permission Denied and Enhance Robustness

## Problem Statement
`onshape-skill` 專案在 CD 部署時出現 `Permission denied (publickey,password)` 錯誤。
主要原因：
1. `deploy.yml` 中的 `DEPLOY_USER` 被硬編碼為 `kevin`，而非使用 GitHub Action Secrets。
2. 缺乏容器清理邏輯，可能導致未來的命名衝突。

## Proposed Solution
- **修正 User 設定**: 將 `DEPLOY_USER` 改為從 `${{ secrets.DEPLOY_USER }}` 讀取，確保與工作區其他專案一致。
- **加強清理**: 在部署腳本中增加對 `photo-measure` 與 `photomeasure` 容器的清理邏輯。
- **更新記憶**: 在 `CLAUDE.md` 中記錄部署規範與所需 Secrets。

## Success Criteria
- [x] `deploy.yml` 已更新為使用 Secret 使用者。
- [x] 增加容器名稱清理邏輯。
- [x] `CLAUDE.md` 已同步最新規範。
