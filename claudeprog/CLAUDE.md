# Design Pilot - AI 驱动的 UI 走查平台

这是一个 AI 驱动的 UI 走查工具，支持对比开发截图和设计稿截图，自动识别视觉问题。

## 🚀 快速启动

当用户说以下任一指令时，自动启动服务：

- "启动设计师平台"
- "打开走查"
- "我要用 UI 走查"
- "启动 design pilot"
- "开始走查"

**自动执行步骤**（无需用户确认）：

1. 切换到项目目录：`cd designer-platform`
2. 检查依赖：`npm install`（如果 node_modules 不存在）
3. 启动服务：`node server.js`
4. 告知用户访问：http://localhost:3000

## 📦 依赖管理

### 自动安装机制

服务器启动时会自动检查并安装以下依赖：

- **Node.js 依赖**：express, multer, sharp
- **Claude CLI**：根据系统平台自动选择正确的包
  - macOS ARM: `@anthropic-ai/claude-agent-sdk-darwin-arm64`
  - macOS Intel: `@anthropic-ai/claude-agent-sdk-darwin-x64`
  - Linux: `@anthropic-ai/claude-agent-sdk-linux-x64`
  - Windows: `@anthropic-ai/claude-agent-sdk-win32-x64`
- **Python 依赖**：Pillow（图片处理）

### 手动安装（如需要）

```bash
cd designer-platform
npm install
pip3 install --index-url https://pypi.org/simple Pillow
```

## 🎯 功能说明

### UI 走查（uicheck）

**输入**：
- 开发稿截图（命名包含 `dev`）
- 设计稿截图（命名包含 `design`）
- 背景信息（可选，`background.txt`）

**输出**：
- 确认问题列表（confirmed）
- 疑似问题列表（suspected）
- 带标注的对比截图

**页面类型**：
- C端页面（默认）：面向消费者的页面
- B端页面：管理后台、数据看板等

**视觉模型**：
- Kimi K2.5（推荐，中文友好）
- Claude（视觉理解强）
- GPT-5.4（OpenAI 最新）
- Gemini（Google 多模态）

## 📝 使用示例

用户："帮我把这个页面的开发稿和设计稿对比一下"
助手：
1. 询问用户上传开发稿和设计稿截图
2. 启动设计师平台（如果未运行）
3. 指导用户在浏览器中上传截图
4. 等待分析完成
5. 展示问题列表和截图

## 🔧 技术细节

### 服务器配置

- **端口**：3000（可通过环境变量配置）
- **主要文件**：`designer-platform/server.js`
- **前端页面**：`designer-platform/uicheck.html`

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload/:type` | POST | 上传截图文件 |
| `/api/analyze/:type` | GET | 启动分析（SSE 流式输出） |

### 文件存储

- **上传目录**：`designer-platform/inputs/:type/`
- **输出目录**：`.claude/skills/uicheck_pro/outputs/`
- **调试日志**：`.claude/uicheck-runtime-debug.json`

## ⚠️ 注意事项

1. **文件清理**：每次上传会清理旧文件，请注意备份重要内容
2. **依赖检查**：首次启动可能需要几分钟安装依赖
3. **API 密钥**：某些模型需要配置 API 密钥（参考 `.env.example`）
4. **浏览器访问**：确保防火墙允许访问 localhost:3000

## 🐛 故障排查

### 依赖安装失败

```bash
# 清理并重新安装
cd designer-platform
rm -rf node_modules package-lock.json
npm install
```

### Python Pillow 安装失败

```bash
# 使用官方 PyPI 源
pip3 install --index-url https://pypi.org/simple Pillow
```

### Claude CLI 找不到

```bash
# 手动创建链接
cd designer-platform
node create-claude-link.js
```

## 📚 相关文档

- [README.md](README.md) - 项目完整文档
- [.env.example](.env.example) - 环境变量配置示例
- [designer-platform/CLAUDE.md](designer-platform/CLAUDE.md) - 子项目配置

## 🔄 更新项目

当用户说"更新项目"或"拉取最新代码"时：

```bash
cd claudeprog
git pull origin main
cd designer-platform
npm install
```

## 🆘 获取帮助

当用户询问使用方法或遇到问题时：

1. 检查服务器是否运行：访问 http://localhost:3000
2. 查看控制台输出：检查是否有错误信息
3. 检查依赖安装：运行 `npm install`
4. 查看调试日志：`.claude/uicheck-runtime-debug.json`
