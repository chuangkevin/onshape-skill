# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**onshape-skill** 是一個 Claude Code skill，用於生成 Onshape FeatureScript 程式碼。
使用者提供圖片、影片或描述，skill 輸出可直接在 Onshape Feature Studio 使用的 FeatureScript 程式碼。

### Key Features
- **Photo-to-CAD Workflow**: 從照片提取尺寸，生成參數化模型
- **Video-to-CAD Workflow**: 從影片辨識物件，自動量測車輛尺寸，生成精細 3D 模型
- **Interactive Confirmation**: 使用者可在生成前確認並修正 AI 辨識的資料

## Skill Definition

- **Skill file**: `SKILL.md` — defines the skill interface and behavior
- **Name**: `onshape-cad`
- **Input**: image path or text description of 3D model requirements
- **Output**: working FeatureScript code for Onshape Feature Studio

## Structure

```
onshape-skill/
├── SKILL.md          # Claude Code skill definition
├── reference.md      # FeatureScript reference & patterns
├── tools/
│   └── measure/      # Measurement helper tools
└── docs/             # Documentation
```

## Usage

```bash
# Invoke via Claude Code
/onshape-cad [image-path or description]
```

## FeatureScript Patterns

- All code targets Onshape Feature Studio
- Reference `reference.md` for common patterns (extrude, revolve, shell, fillet)
- When given an image: analyze geometry first, then generate code
- Prefer parametric definitions over hardcoded values

## Tools

### `tools/measure/` — Photo & Video Measurement Tool

Web 應用程式，提供完整的 Photo-to-CAD 和 Video-to-CAD 工作流程。

#### Video-to-CAD Workflow (車輛影片自動建模)

1. **Upload**: 上傳車輛影片或多張照片
2. **AI Analysis**: Gemini 2.5 Flash 辨識物件類型、車輛品牌型號
3. **Feature Extraction**: 從影格提取特徵尺寸
4. **Vehicle Measurement** (NEW): 從影片實際量測尺寸
   - 偵測參考物件（車牌、人、道路標線）
   - 建立比例尺校正 (px/mm)
   - 多視角合成（側面/正面/俯視）
5. **Web Research**: Google Search 搜尋官方規格，填補缺失資料
6. **Interactive Confirmation** (NEW): 使用者確認並修正辨識結果
   - 編輯車輛品牌、型號、年份
   - 修正尺寸數值
   - 調整特徵信心度
7. **Generate FeatureScript**: 生成精細車輛 3D 模型
   - 參數化車身（車長/車寬/車高/軸距）
   - 引擎蓋曲線
   - 車窗（擋風玻璃 + 側窗）
   - 車燈（頭燈 + 尾燈）
   - 輪子（4 輪圓柱體）

#### Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express + Node.js 22
- **AI**: Gemini API (`@kevinsisi/ai-core` pool)
- **DB**: better-sqlite3
- **Image Processing**: ffmpeg (影格提取)

---

## Deployment

### CI/CD (GitHub Actions)

- **`docker-publish.yml`**: Builds and pushes `linux/amd64` image to Docker Hub (`onshape-measure`).
- **`deploy.yml`**: Deploys to server via Tailscale SSH.
- **Required Secrets**:
  - `DEPLOY_USER`, `DEPLOY_SERVER_IP`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`
  - `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`
  - `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

### Cleanup Policy
- Deployment scripts must clean up both `photo-measure` and `photomeasure` container variants to avoid naming conflicts.
