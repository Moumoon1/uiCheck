# JSON 产出链路

这套文件里，`issues.json` 不是由 Word 脚本自动推断出来的，而是由前置整理步骤产出。

推荐链路：

1. 模型按 skill 完成走查，得到正式问题和疑似问题。
2. 将这些问题整理为结构化源文件，例如 `review_result.json`。
3. 运行 `scripts/build_issues_json.py`，生成标准化的 `issues.json`。
4. 再运行 `scripts/generate_review_doc.py`，按模板输出 Word 文档。

## 推荐的 review_result.json 结构

```json
{
  "title": "某页面设计走查",
  "project": "项目名",
  "date": "2026-04-28",
  "reviewer": "AI 走查助手",
  "owner_default": "待指定",
  "formal_issues": [
    {
      "id": "1",
      "problem": "开发页【某模块】与设计稿在【某项可见差异】上不一致。",
      "suggestion": "按设计稿恢复【对应模块】的【对应结构或样式】。",
      "priority": "P0",
      "status": "待修改",
      "images": ["outputs/issue_1_dev.png", "outputs/issue_1_design.png"]
    }
  ],
  "suspected_issues": [
    {
      "id": "A1",
      "problem": "开发页【某局部细节】可能与设计稿存在差异。",
      "suggestion": "建议对【对应区域】做同尺寸局部放大或叠图确认。",
      "priority": "P2",
      "status": "待修改",
      "images": ["outputs/issue_A1_dev.png", "outputs/issue_A1_design.png"]
    }
  ]
}
```

## 生成命令

```bash
python scripts/build_issues_json.py review_result.json issues.json
python scripts/generate_review_doc.py issues.json output.docx assets/docx/report_template.docx
```

如果不传模板路径，`generate_review_doc.py` 会默认使用包内的 `assets/docx/report_template.docx`。
