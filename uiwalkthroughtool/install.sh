#!/bin/bash
set -e

# ── 设计师平台 一键安装脚本 ──
# 支持 macOS (Intel / Apple Silicon)，全程无交互

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   设计师平台 - 一键安装脚本          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. 检查操作系统 ──
OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
  fail "当前仅支持 macOS，检测到系统: $OS"
fi
ARCH="$(uname -m)"
info "系统: macOS ($ARCH)"

# ── 2. 安装 Homebrew（如果没有） ──
if command -v brew &>/dev/null; then
  info "Homebrew 已安装"
else
  warn "Homebrew 未安装，正在静默安装..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Apple Silicon 需要配置 PATH
  if [ "$ARCH" = "arm64" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    if ! grep -q 'brew shellenv' ~/.zprofile 2>/dev/null; then
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    fi
  fi
  info "Homebrew 安装完成"
fi

# ── 3. 安装 Xcode Command Line Tools（如果没有） ──
if ! xcode-select -p &>/dev/null; then
  warn "Xcode CLT 未安装，正在静默安装..."
  touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
  PROD=$(softwareupdate -l 2>/dev/null | grep -B1 "Command Line Tools" | head -1 | awk -F'"' '{print $2}')
  if [ -n "$PROD" ]; then
    softwareupdate -i "$PROD" 2>/dev/null || true
  else
    xcode-select --install 2>/dev/null || true
  fi
  rm -f /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
  # 等待安装完成（最多 5 分钟）
  for i in $(seq 1 30); do
    if xcode-select -p &>/dev/null; then break; fi
    sleep 10
  done
  if xcode-select -p &>/dev/null; then
    info "Xcode CLT 安装完成"
  else
    warn "Xcode CLT 安装可能未完成，如遇问题请手动运行: xcode-select --install"
  fi
fi

# ── 4. 安装 Node.js ──
if command -v node &>/dev/null && [ "$(node -v | cut -d. -f1 | sed 's/v//')" -ge 18 ]; then
  info "Node.js 已安装: $(node -v)"
else
  warn "Node.js 未安装或版本过低，正在安装..."

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm install 22
    nvm use 22
  else
    warn "安装 nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    source "$HOME/.nvm/nvm.sh"
    nvm install 22
    nvm use 22

    if ! grep -q 'nvm.sh' ~/.zshrc 2>/dev/null; then
      cat >> ~/.zshrc << 'NVM_INIT'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
NVM_INIT
    fi
  fi
  info "Node.js 安装完成: $(node -v)"
fi

# ── 5. 安装 Python3 ──
if command -v python3 &>/dev/null; then
  if python3 -c "print('ok')" &>/dev/null; then
    info "Python3 已安装: $(python3 --version)"
  else
    warn "python3 命令存在但无法执行，正在通过 Homebrew 安装..."
    brew install python3
    info "Python3 安装完成: $(python3 --version)"
  fi
else
  warn "Python3 未安装，正在安装..."
  brew install python3
  info "Python3 安装完成: $(python3 --version)"
fi

# ── 6. 安装 Python 依赖 ──
if command -v pip3 &>/dev/null; then
  if python3 -c "from PIL import Image; print('Pillow OK')" &>/dev/null; then
    info "Python 依赖 (Pillow) 已就绪"
  else
    warn "Pillow 未安装，正在安装..."
    if pip3 install --quiet Pillow; then
      info "Pillow 安装完成"
    else
      fail "Pillow 安装失败！截图生成需要 Pillow，请手动执行: pip3 install Pillow"
    fi
  fi
else
  fail "pip3 未找到！截图生成需要 Python3 + Pillow，请先确保 Python3 正确安装"
fi

# ── 7. 检查 npm 依赖 ──
# 预装 node_modules 随项目分发，无需 npm install
NEED_INSTALL=0
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  NEED_INSTALL=1
elif [ "$ARCH" = "arm64" ] && [ ! -d "$SCRIPT_DIR/node_modules/@img/sharp-darwin-arm64" ]; then
  warn "预装的 node_modules 不匹配当前平台 (arm64)，需要重新安装..."
  NEED_INSTALL=1
elif [ "$ARCH" = "x86_64" ] && [ ! -d "$SCRIPT_DIR/node_modules/@img/sharp-darwin-x64" ]; then
  warn "预装的 node_modules 不匹配当前平台 (x86_64)，需要重新安装..."
  NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" = "1" ]; then
  warn "安装 npm 依赖..."
  cd "$SCRIPT_DIR" && npm install
  info "npm 依赖安装完成"
else
  info "npm 依赖已就绪（预装）"
fi

# ── 8. 安装 MyFlicker (mfcli) ──
if command -v mfcli &>/dev/null; then
  info "mfcli 已安装: $(mfcli --version 2>/dev/null || echo '未知版本')"
else
  warn "安装 MyFlicker (mfcli)..."
  npm install -g @myflicker/cli 2>/dev/null || curl -fsSL https://myflicker.corp.kuaishou.com/install-mf.sh | bash
  info "mfcli 安装完成: $(mfcli --version 2>/dev/null)"
fi

# ── 9. 部署 codeflicker skills 文件 ──
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
CODEFLICKER_DIR="$PARENT_DIR/.codeflicker"
BUNDLED_DIR="$SCRIPT_DIR/bundled/.codeflicker"

if [ -f "$CODEFLICKER_DIR/skills/uicheck_pro/SKILL.md" ]; then
  info "skills 文件已存在，跳过"
else
  warn "部署 skills 文件到 $CODEFLICKER_DIR ..."
  cp -R "$BUNDLED_DIR" "$CODEFLICKER_DIR"
  mkdir -p "$CODEFLICKER_DIR/skills/uicheck_pro/outputs"
  info "skills 文件部署完成"
fi

# ── 10. 创建必要子目录 ──
mkdir -p "$SCRIPT_DIR/inputs"
mkdir -p "$SCRIPT_DIR/outputs"
mkdir -p "$SCRIPT_DIR/runtime_images"

# ── 完成 ──
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   安装完成！                          ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  启动方式："
echo "    cd $SCRIPT_DIR"
echo "    node server.js"
echo ""
echo "  然后浏览器访问: http://localhost:3000"
echo ""
if ! command -v mfcli &>/dev/null || [ ! -f "$HOME/.codeflicker/ai-token.json" ]; then
  echo "  ⚠️  mfcli 未登录，走查功能需要先登录："
  echo "    mfcli"
  echo ""
fi
echo "  环境信息："
echo "    Node.js:  $(node -v)"
echo "    Python3:  $(python3 --version 2>/dev/null || echo '未安装')"
echo "    mfcli: $(mfcli --version 2>/dev/null || echo '未安装')"
echo ""
