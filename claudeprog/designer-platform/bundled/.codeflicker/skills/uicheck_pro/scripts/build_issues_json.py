#!/usr/bin/env python3
"""Build normalized issues.json for the review doc generator.

Purpose:
  Convert model / human review output into a stable issues.json schema that
  generate_review_doc.py can consume.

Usage:
  python build_issues_json.py review_result.json issues.json

Accepted source schema (recommended):
{
  "title": "某页面设计走查",
  "project": "项目名",
  "date": "2026-04-28",
  "reviewer": "AI 走查助手",
  "owner_default": "待指定",
  "formal_issues": [
    {
      "id": "1",
      "problem": "开发页收益卡为双信息结构，设计稿为单核心收益结构。",
      "suggestion": "按设计稿恢复收益卡信息结构与右上内容形式。",
      "priority": "P0",
      "status": "待修改",
      "images": ["/abs/path/dev.png", "/abs/path/design.png"],
      "owner": "张三"
    }
  ],
  "suspected_issues": [
    {
      "id": "A1",
      "problem": "开发页顶部波浪曲线可能比设计稿更生硬。",
      "suggestion": "建议对该区域做同尺寸局部放大或叠图确认。",
      "priority": "P2",
      "status": "待修改",
      "images": ["/abs/path/dev.png", "/abs/path/design.png"]
    }
  ]
}

Also supports a passthrough schema with top-level "issues" already present.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ALLOWED_STATUS = {"待修改", "待验收", "已验收"}
ALLOWED_PRIORITY = {"P0", "P1", "P2"}


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _norm_status(value: Any, default: str = "待修改") -> str:
    if isinstance(value, str) and value in ALLOWED_STATUS:
        return value
    return default


def _norm_priority(value: Any, default: str = "P1") -> str:
    if isinstance(value, str) and value in ALLOWED_PRIORITY:
        return value
    return default


def _norm_images(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value[:2]:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def _build_description(problem: Any, suggestion: Any) -> str:
    p = str(problem or "").strip()
    s = str(suggestion or "").strip()
    lines: list[str] = []
    if p:
        lines.append(f"问题：{p}")
    if s:
        lines.append(f"建议：{s}")
    return "\n".join(lines)


def _normalize_issue(row: dict[str, Any], *, default_date: str, default_reviewer: str, default_owner: str, default_priority: str, kind: str) -> dict[str, Any]:
    issue_id = str(row.get("id") or row.get("seq") or "").strip()
    description = row.get("description")
    if not description:
        description = _build_description(row.get("problem"), row.get("suggestion"))

    return {
        "seq": issue_id,
        "kind": kind,
        "description": str(description or "").strip(),
        "status": _norm_status(row.get("status"), "待修改"),
        "images": _norm_images(row.get("images")),
        "date": str(row.get("date") or default_date or "").strip(),
        "priority": _norm_priority(row.get("priority"), default_priority),
        "reviewer": str(row.get("reviewer") or default_reviewer or "AI 走查助手").strip(),
        "owner": str(row.get("owner") or default_owner or "待指定").strip(),
    }


def build_output(data: dict[str, Any]) -> dict[str, Any]:
    title = str(data.get("title") or "设计走查问题表").strip()
    project = str(data.get("project") or "").strip()
    date = str(data.get("date") or "").strip()
    reviewer = str(data.get("reviewer") or "AI 走查助手").strip()
    owner_default = str(data.get("owner_default") or "待指定").strip()

    issues: list[dict[str, Any]] = []

    if isinstance(data.get("issues"), list):
        for row in data["issues"]:
            if isinstance(row, dict):
                kind = str(row.get("kind") or "formal").strip() or "formal"
                default_priority = "P1" if kind == "formal" else "P2"
                issues.append(
                    _normalize_issue(
                        row,
                        default_date=date,
                        default_reviewer=reviewer,
                        default_owner=owner_default,
                        default_priority=default_priority,
                        kind=kind,
                    )
                )
    else:
        for row in data.get("formal_issues", []):
            if isinstance(row, dict):
                issues.append(
                    _normalize_issue(
                        row,
                        default_date=date,
                        default_reviewer=reviewer,
                        default_owner=owner_default,
                        default_priority="P1",
                        kind="formal",
                    )
                )
        for row in data.get("suspected_issues", []):
            if isinstance(row, dict):
                issues.append(
                    _normalize_issue(
                        row,
                        default_date=date,
                        default_reviewer=reviewer,
                        default_owner=owner_default,
                        default_priority="P2",
                        kind="suspected",
                    )
                )

    return {
        "title": title,
        "project": project,
        "date": date,
        "reviewer": reviewer,
        "owner_default": owner_default,
        "issues": issues,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    src = Path(sys.argv[1])
    out = Path(sys.argv[2])

    data = _load_json(src)
    normalized = build_output(data)
    out.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
