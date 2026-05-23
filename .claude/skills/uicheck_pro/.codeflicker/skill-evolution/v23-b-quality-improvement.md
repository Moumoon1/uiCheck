# uicheck_pro Skill 进化记录 v23

**日期**：2026-05-13  
**版本**：v23  
**主题**：B端走查质量提升 — 枚举类描述精细化 / 文案幻觉防御 / B端截图规范

---

## 背景

用户反馈 B端走查存在三类系统性缺陷：
1. Tab 有一项出问题但只提"Tab对不上"，描述太笼统
2. 两个明明一样的文案说不一样（幻觉误判）
3. 截图空框或截图与问题描述不对应（缺少 B端截图规范示例）

## 根因分析

| 缺陷 | 根因文件 | 缺失内容 |
|------|---------|---------|
| 枚举类描述笼统 | `reference-b/issue_rules.md` | 缺少「枚举类元素强制引用规则」，没有强制逐字列出 Tab/按钮/列名 |
| 文案幻觉误判 | `reference-b/false_positives.md` | 缺少「文案相同性核查」规则，无逐字引用要求 |
| 截图空框 | `reference-b/` 整体 | 没有 B端元素（Tab/表格列/按钮）专属截图框选规范文件，C端有 assets/screenshots/ 示例但 B端无对应 |

## 修复方案（待实施）

### 1. `reference-b/issue_rules.md` — 枚举类强制引用规则

在「问题描述怎么写」新增一节：

```markdown
## 枚举类元素强制引用规则（B端）

以下类型的问题，problem 必须逐字引用两侧可见的具体项名：

**Tab / 标签页**
- 合格：`设计稿 Tab 包含"全部、已发布、审核中"三项，开发稿缺少"审核中"`
- 不合格：`Tab 项不一致`

**操作按钮组**
- 合格：`设计稿操作列包含["删除","编辑","详情"]，开发稿缺少"详情"`
- 不合格：`操作按钮缺失`

**筛选条件**
- 合格：`设计稿筛选区包含"活动名称输入框、状态下拉、时间范围选择器"，开发稿缺少"时间范围选择器"`

**表格列**
- 合格：`设计稿共6列：序号、名称、状态、时间、操作者、操作；开发稿共5列，缺少"操作者"`
```

### 2. `reference-b/false_positives.md` — 文案相同性核查

新增第6节：

```markdown
## 6. 文案相同性核查（防幻觉）

若 problem 描述包含"文案不同"、"文字不一致"等表述，必须：
1. 逐字读取两侧实际文字
2. problem 格式：`开发稿显示"[实际文字]"，设计稿显示"[实际文字]"`
3. 两侧完全相同 → 删除该条问题
4. 无法确认是否相同 → 进 suspected，不进 confirmed
5. 压缩失真判断以主干笔画形态为准，不以边缘锯齿为准
```

### 3. 新建 `reference-b/b_screenshot_guide.md`

B端元素专属截图框选规范：Tab项/表格列/操作按钮/筛选区的 CropRegion+Box 框法；元素不存在时的标准处理（框相邻元素，不框空白）。

### 4. `reference-b/SKILL.md` — 截图示例加载指令

在 Screenshot Rules 章节增加「Assets Screenshot Guide（B端专属）」，引用 `b_screenshot_guide.md` 和 C端通用截图示例。

### 5. `server.js` — loadSkillContext B端文件列表扩展

`loadSkillContext(stage, pageType)` 的 analysis 阶段，B端专属文件列表从 `[issue_rules, false_positives]` 扩展为 `[issue_rules, false_positives, b_screenshot_guide]`。

## 同步路径

- 主路径：`.claude/skills/uicheck_pro/reference-b/`
- 同步路径：`.agents/skills/uicheck_pro/reference-b/`

## B端走查质量三原则（v23确立）

1. **枚举类问题必须逐字列项**：Tab/按钮/列名/筛选条件类问题，problem 必须包含两侧具体项名对比
2. **文案差异必须逐字核查**：先读两侧实际可见文字，相同则不报，无法确认则进疑似
3. **元素不存在不得框空白**：必须框相邻元素并在 problem 中注明"开发稿未实现此元素"
