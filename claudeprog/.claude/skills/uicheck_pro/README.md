# UICheck Package

这个目录是为设计走查 skill 准备的一套完整结构。

## 目录说明
- `skill.md`：主执行规则，只保留硬约束
- `reference/`：补充说明、示例、误判说明
- `assets/`：模板与示意图
- `scripts/`：生成 Word 文档的脚本

## 推荐使用方式
1. 先读取 `skill.md`
2. 再按需查看 `reference/`
3. 导出文档时优先使用 `assets/docx/report_template.docx`
4. 用 `scripts/generate_review_doc.py` 把结构化问题渲染成 Word 文档
