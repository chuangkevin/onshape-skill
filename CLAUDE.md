# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**onshape-skill** 是一個 Claude Code skill，用於生成 Onshape FeatureScript 程式碼。
使用者提供圖片或描述，skill 輸出可直接在 Onshape Feature Studio 使用的 FeatureScript 程式碼。

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

- `tools/measure/` — helper for extracting dimensions from reference images
