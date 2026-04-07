# Tasks - Fix CD Permission Denied

## ✅ Fixes
- [x] 修改 `.github/workflows/deploy.yml`：將 `DEPLOY_USER` 改為 `${{ secrets.DEPLOY_USER }}`
- [x] 修改 `.github/workflows/deploy.yml`：增加對 `photo-measure` 與 `photomeasure` 容器的清理邏輯

## ✅ Documentation
- [x] 更新 `CLAUDE.md`：記錄部署規範與所需 Secrets
- [x] 建立 `openspec/changes/2026-04-08-fix-cd-permission-denied/` 記錄變更
