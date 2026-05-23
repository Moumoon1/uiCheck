# Design Pilot - AI 驱动的 UI 走查平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

对比开发截图和设计稿截图，自动识别 UI 问题。支持 **Claude Code**、**Codex** 等多种 AI 助手。

**📚 [快速开始指南](QUICK_START.md) | [详细使用指南](USAGE_GUIDE.md)**

## ✨ 特性

- 🔍 **智能走查**：自动对比开发稿和设计稿，识别视觉差异
- 🎯 **精准定位**：输出问题坐标，生成标注截图
- 🤖 **多模型支持**：支持 Kimi K2.5、Claude、GPT-5.4、Gemini
- 📊 **双模式**：C端页面 / B端管理后台
- 🚀 **一键启动**：自动安装依赖，无需手动配置

## 📦 快速开始

### 方式一：使用 Claude Code（推荐）

克隆项目后，直接告诉 Claude Code：

```
启动设计师平台
```

Claude Code 会自动完成所有配置和启动。

### 方式二：手动安装

```bash
# 1. 克隆项目
git clone https://github.com/Moumoon1/claudeprog.git
cd claudeprog/designer-platform

# 2. 安装依赖（会自动检测并安装缺失依赖）
npm install

# 3. 启动服务
npm start

# 4. 打开浏览器
# 访问 http://localhost:3000
```

## 🤖 支持的 AI 助手

本项目完美支持以下 AI 编程助手：

| AI 助手 | 支持状态 | 说明 |
|---------|----------|------|
| **Claude Code** | ✅ 完美支持 | 自动安装依赖、启动服务 |
| **Codex** | ✅ 完美支持 | 通过 CLAUDE.md 配置 |
| **Cursor** | ✅ 支持 | 使用 .cursorrules 配置 |
| **其他助手** | ✅ 支持 | 参考 README 手动操作 |

## 🖥️ 系统要求

- **Node.js** >= 18.0.0
- **Python 3** + Pillow（自动安装）
- **操作系统**：macOS / Windows / Linux

## 📖 使用说明

### 1. 准备截图

- **开发稿截图**：命名为 `dev_xxx.png`
- **设计稿截图**：命名为 `design_xxx.png`
- **背景信息**（可选）：创建 `background.txt` 文件

### 2. 上传分析

1. 访问 http://localhost:3000
2. 选择页面类型（C端/B端）
3. 选择视觉模型
4. 上传开发稿和设计稿
5. 点击"开始分析"

### 3. 查看结果

- **确认问题**：明确存在的 UI 问题
- **疑似问题**：可能存在的问题，需人工确认
- **问题截图**：自动生成带标注的对比图

## 🎯 支持的视觉模型

| 模型 | 代号 | 特点 |
|------|------|------|
| Kimi K2.5 | `kimi-k2.5` | 国产模型，中文友好 |
| Claude | `claude` | 视觉理解强 |
| GPT-5.4 | `5` | OpenAI 最新模型 |
| Gemini | `gemini` | Google 多模态模型 |

## 📁 项目结构

```
claudeprog/
├── CLAUDE.md                    # Claude Code 配置文件
├── README.md                    # 项目文档
├── .env.example                 # 环境变量示例
├── designer-platform/           # 主项目目录
│   ├── server.js               # Express 后端服务
│   ├── uicheck.html            # UI 走查页面
│   ├── package.json            # Node.js 依赖配置
│   ├── check-deps.js           # 自动依赖检查
│   ├── create-claude-link.js   # 跨平台 CLI 链接
│   └── inputs/                 # 上传文件目录
└── .claude/                     # Claude Skill 配置
    └── skills/uicheck_pro/     # UI 走查技能
```

## ⚙️ 配置

### 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

主要配置项：

- `DEFAULT_VISION_MODEL`: 默认视觉模型
- `DEFAULT_PAGE_TYPE`: 默认页面类型（c/b）
- `PORT`: 服务端口（默认 3000）

### Claude Code 用户

项目已包含 `CLAUDE.md`，Claude Code 会自动识别并执行：

- 自动检测并安装依赖
- 自动启动服务器
- 自动打开浏览器

### Codex 用户

Codex 会读取 `CLAUDE.md` 文件，与 Claude Code 行为一致。

## 🔧 开发

```bash
# 安装开发依赖
npm install

# 启动开发服务器
npm start

# 手动安装 Python 依赖
pip3 install --index-url https://pypi.org/simple Pillow
```

## 📝 更新日志

### v1.0.0 (2026-05-22)

- ✨ 首次发布
- 🤖 支持 Claude Code / Codex
- 🖥️ 跨平台支持（macOS/Windows/Linux）
- 🎯 支持多种视觉模型
- 📊 支持 C端/B端页面分析

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

- [Claude Code](https://claude.ai/code) - AI 编程助手
- [Anthropic](https://www.anthropic.com/) - Claude API
- [Sharp](https://sharp.pixelplumbing.com/) - 高性能图片处理
