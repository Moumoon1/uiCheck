// 自动创建 Claude CLI 符号链接（跨平台支持）
const fs = require('fs');
const path = require('path');
const platform = process.platform;
const arch = process.arch;

// 根据平台选择正确的包名
const platformPackages = {
  'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64',
  'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64',
  'linux-x64': '@anthropic-ai/claude-agent-sdk-linux-x64',
  'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64'
};

const packageKey = `${platform}-${arch}`;
const packageName = platformPackages[packageKey];

if (!packageName) {
  console.log(`[Claude CLI] 不支持的平台: ${platform}-${arch}`);
  process.exit(0);
}

const binDir = path.join(__dirname, 'node_modules', '.bin');
const claudePath = path.join(__dirname, 'node_modules', packageName, 'claude');

// 检查是否安装了对应平台的包
if (!fs.existsSync(claudePath)) {
  console.log(`[Claude CLI] 未找到 ${packageName}，跳过符号链接创建`);
  process.exit(0);
}

// 创建 .bin 目录
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

// 创建符号链接
const linkPath = path.join(binDir, platform === 'win32' ? 'claude.cmd' : 'claude');

try {
  // 删除旧的链接
  if (fs.existsSync(linkPath)) {
    fs.unlinkSync(linkPath);
  }

  // 创建新链接
  if (platform === 'win32') {
    // Windows 使用批处理文件
    fs.writeFileSync(linkPath, `@${claudePath} %*`);
  } else {
    // Unix 系统使用符号链接
    fs.symlinkSync(path.relative(binDir, claudePath), linkPath);
  }

  console.log(`[Claude CLI] 已创建符号链接: ${linkPath} -> ${claudePath}`);
} catch (err) {
  console.log(`[Claude CLI] 创建符号链接失败:`, err.message);
}
