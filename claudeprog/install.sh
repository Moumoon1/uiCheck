#!/bin/bash

# Design Pilot 一键安装脚本
# 支持 macOS / Linux / Windows (Git Bash)

set -e

echo "======================================"
echo "  Design Pilot - 一键安装"
echo "======================================"
echo ""

# 检测操作系统
OS="$(uname -s)"
case "$OS" in
    Darwin*)  echo "检测到系统: macOS" ;;
    Linux*)   echo "检测到系统: Linux" ;;
    MINGW*)   echo "检测到系统: Windows (Git Bash)" ;;
    *)        echo "检测到系统: $OS" ;;
esac
echo ""

# 切换到脚本所在目录
cd "$(dirname "$0")/designer-platform"

# 1. 检查 Node.js
echo "📦 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js >= 18.0.0"
    echo "   下载地址: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低 (当前: $(node -v))，需要 >= 18.0.0"
    exit 1
fi

echo "✅ Node.js $(node -v)"
echo ""

# 2. 检查 Python
echo "📦 检查 Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 未检测到 Python3，请先安装"
    echo "   macOS: brew install python3"
    echo "   Linux: sudo apt-get install python3"
    echo "   Windows: https://www.python.org/downloads/"
    exit 1
fi

echo "✅ Python $(python3 --version)"
echo ""

# 3. 安装 Node.js 依赖
echo "📦 安装 Node.js 依赖..."
npm install
echo "✅ Node.js 依赖安装完成"
echo ""

# 4. 安装 Python 依赖
echo "📦 安装 Python 依赖..."
if python3 -c "from PIL import Image" 2>/dev/null; then
    echo "✅ Pillow 已安装"
else
    echo "正在安装 Pillow..."
    pip3 install --index-url https://pypi.org/simple Pillow || {
        echo "⚠️  Pillow 安装失败，请手动安装: pip3 install Pillow"
    }
    echo "✅ Pillow 安装完成"
fi
echo ""

# 5. 创建 Claude CLI 链接
echo "📦 配置 Claude CLI..."
node create-claude-link.js 2>/dev/null || echo "⚠️  Claude CLI 链接创建失败，但不影响使用"
echo ""

# 完成
echo "======================================"
echo "  ✅ 安装完成！"
echo "======================================"
echo ""
echo "🚀 启动服务："
echo "   npm start"
echo ""
echo "🌐 访问地址："
echo "   http://localhost:3000"
echo ""
