## ADDED Requirements

### Requirement: CI/CD 注入 Gemini API Keys
部署流程 SHALL 將 `GEMINI_API_KEYS` GitHub Secret 寫入伺服器的 `.env` 檔案，Docker 容器 SHALL 透過 `env_file` 讀取這些環境變數。

#### Scenario: 部署時自動寫入 .env
- **WHEN** GitHub Actions deploy workflow 執行到 "Write .env to server" 步驟
- **THEN** 系統 SHALL 透過 SSH 在伺服器的 `DEPLOY_PATH` 目錄建立 `.env` 檔案，包含 `GEMINI_API_KEYS` 的值

#### Scenario: Docker 容器讀取 .env
- **WHEN** `docker compose up` 啟動容器
- **THEN** 容器內的 `GEMINI_API_KEYS` 環境變數 SHALL 包含所有設定的 API keys

#### Scenario: .env 不進入版本控制
- **WHEN** `.env` 檔案存在於部署目錄
- **THEN** `.gitignore` SHALL 排除 `.env` 檔案（已完成）
