# 设计师平台

本地 Web 平台，提供 UI 走查功能。

## 启动前必做

**首次使用必须先安装依赖**，运行：

```bash
npm install
```

安装完成后需要配置 Claude API 密钥。

## 启动

```bash
node server.js
```

启动后浏览器访问 http://localhost:3000 （自动跳转走查页面）

## 依赖

- Node.js >= 18
- Python3 + Pillow
- npm 依赖: express, multer, sharp

## 项目结构

```
designer-platform/
├── server.js           # Express 后端，走查 API 和 Claude API 调用
├── uicheck.html        # UI 走查页面
├── node_modules/       # npm 依赖
├── ../.claude/skills/uicheck_pro/  # uicheck skill 文件
├── inputs/             # 用户上传文件
├── outputs/            # 输出文件
└── runtime_images/     # 运行时截图
```

## AI 助手行为

当用户说"启动设计师平台"、"我要走查"、"打开走查"时：
1. 先检测依赖：`node -v`、`python -c "from PIL import Image"`
2. 如果任何依赖缺失，运行 `npm install`
3. 依赖就绪后，运行 `node server.js` 启动服务
4. 告知用户访问 http://localhost:3000