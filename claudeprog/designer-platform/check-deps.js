const { execSync } = require('child_process');
const fs = require('fs');

console.log('[依赖检查] 开始检查必要依赖...\n');

let needsInstall = [];

// 检查 Pillow
try {
  execSync('python3 -c "from PIL import Image"', { stdio: 'pipe' });
  console.log('✓ Pillow 已安装');
} catch {
  console.log('✗ Pillow 未安装');
  needsInstall.push('pillow');
}

// 检查 claude CLI
try {
  execSync('npx claude --version', { stdio: 'pipe' });
  console.log('✓ Claude CLI 已安装');
} catch {
  console.log('✗ Claude CLI 未安装');
  needsInstall.push('claude');
}

if (needsInstall.length > 0) {
  console.log('\n[自动安装] 正在安装缺失的依赖...\n');

  if (needsInstall.includes('pillow')) {
    console.log('正在安装 Pillow...');
    try {
      execSync('pip3 install --index-url https://pypi.org/simple Pillow', {
        stdio: 'inherit',
        timeout: 180000
      });
      console.log('✓ Pillow 安装成功\n');
    } catch (err) {
      console.error('✗ Pillow 安装失败:', err.message);
    }
  }

  if (needsInstall.includes('claude')) {
    console.log('正在安装 Claude CLI...');
    try {
      execSync('npm install @anthropic-ai/claude-agent-sdk-darwin-arm64', {
        stdio: 'inherit',
        timeout: 180000
      });
      // 创建符号链接
      const binDir = './node_modules/.bin';
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }
      const linkPath = `${binDir}/claude`;
      if (!fs.existsSync(linkPath)) {
        fs.symlinkSync('../@anthropic-ai/claude-agent-sdk-darwin-arm64/claude', linkPath);
      }
      console.log('✓ Claude CLI 安装成功\n');
    } catch (err) {
      console.error('✗ Claude CLI 安装失败:', err.message);
    }
  }

  console.log('[自动安装] 依赖安装完成\n');
} else {
  console.log('\n[依赖检查] 所有依赖已就绪\n');
}
