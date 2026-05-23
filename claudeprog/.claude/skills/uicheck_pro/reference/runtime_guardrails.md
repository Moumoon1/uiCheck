# Runtime Guardrails

## 输出格式约束
- 面向页面展示的内容只能使用最终结果文本或最终 JSON，不得直接透传 stream-json、reasoning 或 tool 过程文本
- 若需要生成分析用缩略图或转码图，文件扩展名必须与真实格式一致；输出为 PNG 时，文件名也必须是 `.png`

## 图片引用格式
- 图片输入必须使用 CodeFlicker 可识别的引用格式：`@绝对路径`（或官方 attachment 格式）；普通文本路径不会自动当作图片读取
- `@绝对路径` 只表示把本地文件作为附件传入，不代表底层模型一定具备 vision 能力
- 在调用模型前必须打印并落盘最终 prompt，确保每张图片引用都是本次上传文件的 `@绝对路径`
- 真实 dev/design 图片必须用 `@绝对路径` 放进 prompt，并要求先做读图验证；若当前模型是纯文本模型或未开启 vision，则必须直接判定为读图失败并停止输出，不得继续分析

## sharp 中间转换陷阱（已验证）
- **禁止**用 sharp 对上传图片做中间 re-encode 再传给模型：sharp 转码后的 PNG 文件内容会与原图不一致，导致模型读出完全错误的页面内容（如原图是"AI灵境计划"，模型读出"数据概览"）
- step1/step2 必须直接使用用户上传的原始文件（`inputs/uicheck/` 目录下），不得经过任何 sharp 压缩或格式转换
- 若将来需要压缩大图，必须先用 `codeflicker -q` 在终端验证转换后的文件模型能否正确读取内容，再决定是否启用

## codeflicker CLI 模型选择机制（已验证 v0.5.3）
- **核心发现**：`codeflicker -q` **不继承 IDE 面板选择的模型**，默认走 `wanqing/glm-5`（无视觉能力）；必须显式传 `--model <modelId>`
- **可用视觉模型 ID**：
  - `sonnet` → `claude-4.6-sonnet`（有视觉，推荐用于 uicheck）
  - `flash` → `gemini-3.1-pro`（有视觉，可作为备选）
  - `wanqing/glm-5` / `wanqing/glm-5.1` → GLM（无视觉，**不能用于读图**）
  - 其他名称（`gpt-4o`, `claude-3-5-sonnet`, `claude-sonnet` 等）均 fallback 到 GLM
- **额度耗尽时的危险行为**：当视觉模型额度用完，codeflicker **静默 fallback** 到 GLM，不报错、不警告；GLM 会幻觉出虚假图片内容，输出看起来"正常"但完全是编造的
- **server.js 必须做的事**：
  1. uicheck step1/step2 都传 `--model sonnet`
  2. 检测 raw output 中的 `额度上限|fallback to wanqing` 字样，若发现立即返回错误提示给前端，不要继续流程
  3. 读图验证逻辑也作为第二道防线：验证内容必须与真实图片一致

## codeflicker CLI 调用模式选择（已验证 v0.5.3）
- **interactive 模式**（无 `-q`）：**不能从 Node.js spawn 调用**，会报 "Raw mode is not supported on the current process.stdin" 错误（Ink 框架需要 TTY）。仅适用于终端手动调用
- **`-q` 模式**：可从 spawn 调用，模型有 Read 工具可用，但关键是**必须配 `--model sonnet` 确保视觉能力**
- **结论**：server.js 中 uicheck step1/step2 统一用 `-q --model sonnet --output-format stream-json` + `@绝对路径`
- step1 prompt 改为 `@绝对路径` 直接传图（不再用 Read 工具+相对路径，因为 interactive 模式不可用）
- step2 prompt 同样用 `@绝对路径` 传两张图

## 背景信息约束
- 背景信息传给模型时应传纯文本内容，不要把本地文件路径当作背景正文

## 身份稳定性
- 若为了稳定性压缩分析图，压缩后仍要保持 dev/design 身份不变，并在 prompt 中再次声明身份
- 文件选择优先使用本次上传状态，其次按修改时间倒序选择最新文件，避免历史残留图片被误选

## 防模板污染
- 若模型输出明显复述示例或模板句式，优先核对运行时落盘 prompt 与当前源码是否一致，并确认服务已重启到最新版本，避免"源码已改但旧进程仍在跑"
- 参考文件只提供字段说明、硬约束、排除项和中性模板；不得把 reference 中的业务名、模块名、示例句子直接当作本次结论
- 结论只能来自当次截图中可见证据；截图里看不到的模块名、业务名、文案，不得凭 reference 补写
- 若某条结论的关键词只出现在 reference、不出现在截图证据中，必须删除或改写为基于截图可见事实的描述

## Python 截图脚本 UTF-8 编码（v12 已修复）
- `generateScreenshotScript()` 生成的 Python 脚本内嵌中文 JSON 数据（问题描述），脚本开头必须声明 `# -*- coding: utf-8 -*-`
- 没有编码声明时，Python 3.9 解析器遇到中文 UTF-8 字节会抛 `SyntaxError: Non-UTF-8 code starting with '\xe5'`，导致 Phase B 截图静默失败
- **教训**：任何动态生成 Python 脚本并内嵌中文/非 ASCII 数据的场景，必须在脚本开头声明编码

## 疑似问题检出率（v12 优化）
- 数量上限从 8 改为 15（confirmed + suspected 合计）
- specText（设计稿模块清单）不再截断 name/content/visual，模型能看到完整描述和视觉特征
- false_positives.md 中"极弱的视觉感觉型判断"不再默认排除，改为建议纳入疑似问题
- prompt 明确鼓励疑似问题多报："宁可多报也不要漏报"

## assets/examples 默认不进入 analysis
- assets 和 examples 默认不进入 analysis 阶段 prompt，只在调试截图规则或误判案例时按需使用
- 截图规范示例（assets/screenshots/）只在调试截图框选规则时按需加载，analysis 阶段不强制读取

## devCropRegion / designCropRegion 必须相同（v13 新增）
- **问题**：模型为 dev 和 design 输出了不同的 CropRegion，导致两张截图的视窗范围错位，用户无法左右对比
- **规则**：`devCropRegion` 和 `designCropRegion` 必须完全相同（top/bottom/left/right 四值一致）；`devBox` 和 `designBox` 可以不同，但必须框选同一视觉元素
- **写入位置**：`server.js buildUICheckStep2AnalysisPrompt()` 的"截图坐标强制规则"段；`output_schema.md` 坐标规则段
- **验证方法**：检查 outputs/ 目录下同一 issue 的 dev/design 截图，确认两张图的高度相近（视窗一致）

## 前端 zoomImages 数组覆盖 bug（v13 已修复）
- **现象**：点击 confirmed 表格截图缩略图，放大图却显示 suspected 的截图（对不上）
- **根因**：每次 `renderTable()` 都用局部 `zoomImages` 覆盖 `window._zoomImages`；suspected 表格渲染后，confirmed 的所有 idx 全部错位
- **修复**：改为累积追加（`if (!window._zoomImages) window._zoomImages = []`，直接引用全局数组而非覆盖）；每次新走查开始时重置 `window._zoomImages = []`
- **位置**：`designer-platform/uicheck.html` 第 827 行及走查开始的 reset 处
