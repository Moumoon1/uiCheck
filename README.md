# UI Walkthrough Tool

AI 驱动的 UI 走查平台，帮助设计师和开发者快速发现开发稿与设计稿之间的视觉偏差。

## 解决的问题

设计师在交付开发后，通常需要**人工逐页对比**开发稿和设计稿，耗时且容易遗漏细节。本工具通过 AI 视觉对比 + 规则化走查，自动发现问题并生成带红框标注的截图报告，把走查从"人眼看、逐条记"变成"上传等结果"。

## 工作流程

### Step 1：设计稿模块分析

上传设计稿图片后，模型识别页面结构，从上到下输出模块清单，每个模块包含：

- 模块名称、内容概述、视觉特征
- `designCropRegion`：该模块在设计稿中的位置坐标（0.0-1.0 比例）

这一步建立了后续"按模块定位"的地图。

### Step 2A：整页快速对比（找大问题）

将开发稿和设计稿两张整图同时传给模型，内嵌 SKILL.md 和 reference 规则文件（issue_rules、false_positives、output_schema、runtime_guardrails），要求：

- 先做硬读图验证（分别描述两张图真实可见的内容，确认图片被正确读取）
- 逐模块对比结构：模块缺失、顺序错误、样式明显不一致
- 排除动态数据差异（金额、时间、用户昵称等）
- 输出的问题分为 confirmed（P0/P1）和 suspected（P2）
- 每条问题附带独立坐标：`devCropRegion`、`devBox`、`designCropRegion`、`designBox`

### Step 2B：逐模块细节扫描（找小问题）

对 Step 1 识别出的每个模块单独进行细查：

1. **裁局部图**：按 `designCropRegion` 从开发稿和设计稿分别裁出模块区域（上下各加 15% padding 保留上下文）
2. **单独调用模型**：传入两张局部图，专门检查微观细节
3. **检查项目**：字号、字重、行高、间距、内边距、按钮高度、图标尺寸、圆角、描边、阴影、文字颜色、对齐方式
4. 所有发现的差异进入 suspected（P2），不限制数量

### 合并 & 截图生成

Step 2A 和 Step 2B 的结果合并为一份完整问题列表：

```
confirmed: [Step 2A 的正式问题]
suspected: [Step 2A 疑似 + Step 2B 细扫疑似]
```

然后为每条问题生成截图：

- 按 `CropRegion` 裁出上下文窗口
- 按 `Box` 画红色标记框指向具体问题元素
- dev 和 design 各自独立裁图，不强制相同坐标

最终在前端渲染成问题表格，左右对照展示。

## 保证精确的技术思路

- **规则化 Skill 驱动**：AI 不是"凭感觉判断"，而是按照预定义的走查规则（SKILL.md、issue_rules、false_positives、output_schema、runtime_guardrails）逐条判断
- **硬读图验证**：每步分析前模型必须先描述图片中真实可见的内容，确认图片被正确读取后才能输出问题，防止"幻觉走查"
- **动态数据过滤**：自动排除文案、金额、时间等动态内容差异，只关注结构性和样式性问题
- **两步分离**：Step 2A 整页找大问题 → Step 2B 逐模块细查小问题，兼顾速度和精度
- **独立坐标裁剪**：devCropRegion 和 designCropRegion 各自独立定位，同一模块在两张图中不在同一位置时也能准确裁图
- **双层截图**：CropRegion = 截图范围（模块上下文），Box = 红框位置（具体问题元素），确保截图和问题描述一一对应

## 快速开始

**方式一：一键启动**

```bash
chmod +x install.sh
./install.sh
```

脚本会自动安装依赖并启动服务器，完成后访问 http://localhost:3000。

**方式二：AI Agent 对话**

在 Claude Code 或 Codex 中打开本项目目录，直接告诉 Agent 即可，例如：

> "帮我启动 UI 走查工具"

Agent 会自动安装依赖、启动服务器，并为你打开 Web 界面。

**方式三：手动启动**

```bash
cd uiwalkthroughtool
npm install
node server.js
```

启动后浏览器访问 http://localhost:3000，上传截图、填写走查需求、选择你已有的 AI 模型，即可开始走查。

## 模型支持

- **CLI 方式**：自动检测本地 Claude Code / Codex / Cursor CLI，使用 CLI 自身配置的模型
- **API 直连**：在界面中配置 API Key，支持 OpenAI、Anthropic、Google Gemini、Moonshot、Qwen 等

## 项目结构

```
├── uiwalkthroughtool/
│   ├── server.js           # Express 后端，走查 API 和 AI 模型调用
│   │                       # Step 1 prompt、Step 2A/2B 流程、截图生成
│   └── uicheck.html        # 前端走查页面，上传、模型选择、问题表格
├── .claude/skills/uicheck_pro/
│   ├── SKILL.md            # 走查总规则：目标、身份、截图规范
│   ├── reference/
│   │   ├── issue_rules.md      # 正式问题 / 疑似问题分类规则
│   │   ├── false_positives.md  # 误判信号、动态数据排除
│   │   ├── output_schema.md    # JSON 字段规范、坐标规则
│   │   ├── runtime_guardrails.md # 运行时约束、防模板污染
│   │   ├── screenshot_rules.md  # CropRegion vs Box 拆分规则
│   │   └── review_scope.md     # 适用范围、默认重点
│   └── outputs/            # 生成的问题截图（issue_*_dev.png / issue_*_design.png）
├── install.sh              # 一键安装依赖并启动服务
└── README.md
```
