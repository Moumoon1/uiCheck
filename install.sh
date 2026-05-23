#!/bin/bash
# UI Walkthrough Tool — 一键安装并启动

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$SCRIPT_DIR/uiwalkthroughtool"

# 检查 Node.js
if ! command -v node &>/dev/null; then
  echo "缺少 Node.js，请先安装: https://nodejs.org"
  exit 1
fi

# 安装依赖
cd "$TOOL_DIR" && npm install

echo ""
echo "启动服务器..."
echo ""

node server.js
