# onshape-skill

Claude Code Skill — 把照片 / 影片 / 文字描述自動轉成 Onshape Feature Studio 可貼上執行的 FeatureScript 程式碼。內含 Photo-to-CAD 與 Video-to-CAD 工作流。

## 一句話描述

`/onshape-cad <image-path | description>` 自動產出參數化 Onshape FeatureScript（最具特色的應用：上傳一段車輛影片，自動量測車身尺寸並建出精細 3D 車模型）。

## 技術棧

- **Skill**：Claude Code skill 形式（`SKILL.md` 定義介面 + behavior）
- **Workflow Tool**：`tools/measure/`（React + Vite + TailwindCSS 前端 + Express + Node.js 22 後端）
- **AI**：Gemini API，透過 `@kevinsisi/ai-core` key pool
- **DB**：better-sqlite3
- **Image / Video processing**：ffmpeg（影格提取）+ 多視角合成（側面 / 正面 / 俯視）+ 比例尺校正（車牌、人、道路標線）
- **部署平台**：x86_64（homedocker VM，因 ultralytics / OpenCV 不支援 ARM 主流環境）

## 主要功能

### Photo-to-CAD
從照片提取尺寸 → 生成參數化模型 → 直接貼到 Feature Studio。

### Video-to-CAD（車輛專用）

1. 上傳車輛影片或多張照片
2. Gemini 2.5 Flash 辨識物件類型、車輛品牌型號
3. 從影格提取特徵尺寸
4. 偵測參考物件 → 建立比例尺校正（px/mm）→ 多視角合成
5. Google Search 搜尋官方規格填補缺失資料
6. 互動式確認介面（修正品牌 / 型號 / 年份 / 尺寸 / 特徵信心度）
7. 生成精細 FeatureScript：
   - 參數化車身（車長 / 車寬 / 車高 / 軸距）
   - 引擎蓋曲線
   - 車窗（擋風玻璃 + 側窗）
   - 車燈（頭燈 + 尾燈）
   - 輪子（4 輪圓柱體）

## 結構

```
onshape-skill/
├── SKILL.md          # Claude Code skill 定義（input / output / behavior）
├── reference.md      # FeatureScript 常用模式（extrude / revolve / shell / fillet）
├── tools/measure/    # Photo & Video Measurement Web Tool
├── docs/
└── openspec/
```

## 使用方式

### 透過 Claude Code skill

```
/onshape-cad <image-path 或文字描述>
```

### Web 工具（measure）

部署後對外網址 `onshape.sisihome.org`（RPi Caddy 反向代理 → homedocker VM port 6123）。直接在瀏覽器上傳影片 → 走完 Video-to-CAD 工作流 → 下載 FeatureScript。

## 部署

### CI/CD（GitHub Actions）

- `docker-publish.yml`：build + push `linux/amd64` image 到 Docker Hub（`onshape-measure`）
- `deploy.yml`：透過 Tailscale SSH 部署到 homedocker VM

部署時必須清理 `photo-measure` 與 `photomeasure` 兩種舊命名變體，避免容器名稱衝突。

### 必要 Secrets

`DEPLOY_USER`、`DEPLOY_SERVER_IP`、`DEPLOY_PATH`、`DEPLOY_SSH_KEY`、`TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET`、`DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`

## URL

- Repo：<https://github.com/chuangkevin/onshape-skill>
- 對外部署：`https://onshape.sisihome.org`
- Image：`onshape-measure`（Docker Hub）
