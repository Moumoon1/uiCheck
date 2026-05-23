const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const app = express();
const PORT = 3000;
const PROJECT_DIR = path.resolve(__dirname);
const INPUTS_DIR = path.join(PROJECT_DIR, 'inputs');
const PARENT_DIR = path.resolve(PROJECT_DIR, '..');
const UICHECK_RUNTIME_DEBUG_PATH = path.join(PARENT_DIR, '.claude', 'uicheck-runtime-debug.json');
const UICHECK_UPLOAD_STATE_PATH = path.join(PARENT_DIR, '.claude', 'uicheck-latest-upload.json');
const UICHECK_PROMPT_DEBUG_DIR = path.join(PARENT_DIR, '.claude', 'uicheck-prompts');
const UICHECK_ANALYSIS_IMAGES_DIR = path.join(PROJECT_DIR, 'runtime_images');

// ── uicheck skill directory (唯一运行时目录，无 fallback) ──
const SERVER_VERSION = '2026.05.21-v1';
const SKILL_DIR = path.join(PARENT_DIR, '.claude', 'skills', 'uicheck_pro');
const SKILL_MD_PATH = path.join(SKILL_DIR, 'SKILL.md');
const REF_DIR = path.join(SKILL_DIR, 'reference');
const REF_DIR_B = path.join(SKILL_DIR, 'reference-b');
const OUTPUTS_DIR = path.join(SKILL_DIR, 'outputs');

// ── 存储 API 配置（会话级别）─
let currentApiConfig = null;

// ── 直接调用 AI API（不使用 CLI）─
async function callAiApiDirectly(prompt, imagePaths = [], model = null) {
  if (!currentApiConfig) {
    throw new Error('未设置 API 配置');
  }

  const { provider, apiKey, baseUrl } = currentApiConfig;
  const visionModel = model || document.getElementById('visionModel')?.value || 'gpt-4o';

  console.log(`[API] 直接调用 ${provider} API, model: ${visionModel}`);

  // 构建图片内容
  const imageContent = [];
  for (const imgPath of imagePaths) {
    if (fs.existsSync(imgPath)) {
      const imageBuffer = fs.readFileSync(imgPath);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(imgPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      imageContent.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` }
      });
    }
  }

  // 根据提供商调用不同的 API
  switch (provider) {
    case 'openai':
      return await callOpenAiApi(baseUrl || 'https://api.openai.com/v1', apiKey, prompt, imageContent, visionModel);
    case 'anthropic':
      return await callAnthropicApi(baseUrl || 'https://api.anthropic.com', apiKey, prompt, imageContent, visionModel);
    case 'google':
      return await callGoogleApi(baseUrl || 'https://generativelanguage.googleapis.com/v1beta', apiKey, prompt, imageContent, visionModel);
    case 'moonshot':
      return await callMoonshotApi(baseUrl || 'https://api.moonshot.cn/v1', apiKey, prompt, imageContent, visionModel);
    case 'custom':
      return await callCustomApi(baseUrl, apiKey, prompt, imageContent, visionModel);
    default:
      throw new Error(`不支持的 API 提供商: ${provider}`);
  }
}

// OpenAI API 调用
async function callOpenAiApi(baseUrl, apiKey, prompt, imageContent, model) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContent
          ]
        }
      ],
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API 调用失败: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Anthropic API 调用
async function callAnthropicApi(baseUrl, apiKey, prompt, imageContent, model) {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContent.map(img => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.image_url.url.split(';')[0].split(':')[1],
                data: img.image_url.url.split(',')[1]
              }
            }))
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API 调用失败: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Google Gemini API 调用
async function callGoogleApi(baseUrl, apiKey, prompt, imageContent, model) {
  const response = await fetch(`${baseUrl}/models/${model || 'gemini-pro-vision'}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            ...imageContent.map(img => ({
              inline_data: {
                mime_type: img.image_url.url.split(';')[0].split(':')[1],
                data: img.image_url.url.split(',')[1]
              }
            }))
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API 调用失败: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// Moonshot (Kimi) API 调用
async function callMoonshotApi(baseUrl, apiKey, prompt, imageContent, model) {
  // Moonshot API 与 OpenAI 兼容
  return await callOpenAiApi(baseUrl, apiKey, prompt, imageContent, model || 'moonshot-v1-8k-vision');
}

// 自定义 API 调用
async function callCustomApi(baseUrl, apiKey, prompt, imageContent, model) {
  // 假设与 OpenAI 格式兼容
  return await callOpenAiApi(baseUrl, apiKey, prompt, imageContent, model);
}

// ── 自动检测当前运行环境并获取对应 CLI ──
function detectAndGetCliPath() {
  const platform = process.platform;
  const arch = process.arch;

  // 平台包映射（用于本地安装）
  const platformPackages = {
    'claude': {
      'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64',
      'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64',
      'linux-x64': '@anthropic-ai/claude-agent-sdk-linux-x64',
      'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64'
    },
    'codex': {
      'darwin-arm64': '@openai/codex-cli-darwin-arm64',
      'darwin-x64': '@openai/codex-cli-darwin-x64',
      'linux-x64': '@openai/codex-cli-linux-x64',
      'win32-x64': '@openai/codex-cli-win32-x64'
    }
  };

  // 检测当前是在哪个工具中运行
  function detectCurrentTool() {
    // 1. 检查环境变量
    // Claude Code 可能设置的环境变量
    if (process.env.CLAUDE_CODE || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) {
      console.log('[CLI] 检测到 Claude Code 环境（通过环境变量）');
      return 'claude';
    }

    // Codex 可能设置的环境变量
    if (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || process.env.CODEX_SESSION) {
      console.log('[CLI] 检测到 Codex 环境（通过环境变量）');
      return 'codex';
    }

    // 2. 检查父进程（看看是谁启动的 node）
    try {
      const ppid = process.ppid;
      const parentCmd = require('child_process')
        .execSync(`ps -p ${ppid} -o comm=`, { stdio: ['pipe', 'pipe', 'pipe'] })
        .toString()
        .trim();

      console.log('[CLI] 父进程:', parentCmd);

      if (parentCmd.includes('claude') || parentCmd.includes('Claude')) {
        console.log('[CLI] 检测到 Claude Code 环境（通过父进程）');
        return 'claude';
      }

      if (parentCmd.includes('codex') || parentCmd.includes('Codex')) {
        console.log('[CLI] 检测到 Codex 环境（通过父进程）');
        return 'codex';
      }
    } catch (e) {
      // 无法获取父进程信息，继续其他检测
    }

    // 3. 检查工作目录的配置文件
    const claudeMdPath = path.join(PARENT_DIR, 'CLAUDE.md');
    const cursorRulesPath = path.join(PARENT_DIR, '.cursorrules');

    if (fs.existsSync(claudeMdPath)) {
      console.log('[CLI] 检测到 Claude Code 环境（通过 CLAUDE.md）');
      return 'claude';
    }

    // 4. 默认：检查哪个 CLI 可用
    const tools = ['claude', 'codex'];
    for (const tool of tools) {
      try {
        require('child_process').execSync(`which ${tool}`, { stdio: 'pipe' });
        console.log(`[CLI] 未检测到特定环境，使用可用的 ${tool} CLI`);
        return tool;
      } catch {
        continue;
      }
    }

    // 5. 最终默认
    console.warn('[CLI] 无法检测运行环境，默认使用 claude');
    return 'claude';
  }

  // 检测当前工具
  const detectedTool = detectCurrentTool();

  // 获取该工具的 CLI 路径
  const platformPackage = platformPackages[detectedTool]?.[`${platform}-${arch}`];
  if (platformPackage) {
    const localPath = path.join(PROJECT_DIR, 'node_modules', platformPackage, detectedTool);
    if (fs.existsSync(localPath)) {
      console.log(`[CLI] 使用本地安装: ${localPath}`);
      return { cliPath: localPath, tool: detectedTool };
    }
  }

  // 检查 bin 链接
  const binPath = path.join(PROJECT_DIR, 'node_modules', '.bin', detectedTool);
  if (fs.existsSync(binPath)) {
    console.log(`[CLI] 使用 bin 链接: ${binPath}`);
    return { cliPath: binPath, tool: detectedTool };
  }

  // 检查全局命令
  try {
    require('child_process').execSync(`which ${detectedTool}`, { stdio: 'pipe' });
    console.log(`[CLI] 使用全局命令: ${detectedTool}`);
    return { cliPath: detectedTool, tool: detectedTool };
  } catch {
    // 降级到另一个工具
    console.warn(`[CLI] ${detectedTool} CLI 不可用，尝试使用其他 CLI`);
    const fallbackTool = detectedTool === 'claude' ? 'codex' : 'claude';
    return { cliPath: fallbackTool, tool: fallbackTool };
  }
}

// 缓存检测结果（启动时检测一次）
let cachedCliInfo = null;
function getCliPath() {
  if (!cachedCliInfo) {
    cachedCliInfo = detectAndGetCliPath();
  }
  return cachedCliInfo;
}

function readTextFileIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  } catch (e) {
    console.log('[readTextFileIfExists] error:', e.message);
    return '';
  }
}

function loadUICheckSkillMarkdown(pageType = 'c') {
  if (pageType === 'b') {
    const bPath = path.join(REF_DIR_B, 'SKILL.md');
    if (fs.existsSync(bPath)) return readTextFileIfExists(bPath);
  }
  return readTextFileIfExists(SKILL_MD_PATH);
}

function toClaudeFileRef(filePath) {
  if (!filePath) return '';
  return `@${path.resolve(filePath)}`;
}


function loadSkillContext(stage, pageType = 'c') {
  // stage: 'analysis' → issue_rules + false_positives + output_schema + runtime_guardrails
  // stage: 'screenshot' → screenshot_rules
  // stage: 'doc' → doc_rules
  // pageType: 'b' uses reference-b/ for issue_rules + false_positives; others fall back to reference/
  const baseDir = REF_DIR;
  const bDir = REF_DIR_B;
  const files = [];
  try {
    if (stage === 'analysis') {
      // issue_rules and false_positives: use B-specific if pageType='b' and file exists
      for (const name of ['issue_rules.md', 'false_positives.md']) {
        const bPath = path.join(bDir, name);
        const fp = (pageType === 'b' && fs.existsSync(bPath)) ? bPath : path.join(baseDir, name);
        const content = readTextFileIfExists(fp);
        if (content) files.push({ name, path: fp, content });
      }
      // output_schema and runtime_guardrails: always use base reference/
      for (const name of ['output_schema.md', 'runtime_guardrails.md']) {
        const fp = path.join(baseDir, name);
        const content = readTextFileIfExists(fp);
        if (content) files.push({ name, path: fp, content });
      }
      // B端专属截图规范：b_screenshot_guide.md 内嵌到 analysis prompt
      if (pageType === 'b') {
        const bScreenshotGuide = path.join(bDir, 'b_screenshot_guide.md');
        const content = readTextFileIfExists(bScreenshotGuide);
        if (content) files.push({ name: 'b_screenshot_guide.md', path: bScreenshotGuide, content });
      }
    } else if (stage === 'screenshot') {
      const fp = path.join(baseDir, 'screenshot_rules.md');
      const content = readTextFileIfExists(fp);
      if (content) files.push({ name: 'screenshot_rules.md', path: fp, content });
    } else if (stage === 'doc') {
      const fp = path.join(baseDir, 'doc_rules.md');
      const content = readTextFileIfExists(fp);
      if (content) files.push({ name: 'doc_rules.md', path: fp, content });
    }
  } catch (e) {
    console.log('[loadSkillContext] error:', e.message);
  }
  return files;
}

// ── 启动时前置依赖检查 ──
function checkPrerequisites() {
  const missing = [];

  // 检查 claude (通过 npx)
  try {
    require('child_process').execSync('npx claude --version', { stdio: 'pipe' });
  } catch {
    missing.push('claude CLI');
  }

  // 检查 python3 + Pillow
  try {
    require('child_process').execSync('python3 -c "from PIL import Image"', { stdio: 'pipe' });
  } catch {
    try {
      require('child_process').execSync('which python3', { stdio: 'pipe' });
      missing.push('Pillow');
    } catch {
      missing.push('Python3');
    }
  }

  // 检查 claude skill
  if (!fs.existsSync(SKILL_MD_PATH)) {
    missing.push('uicheck_pro SKILL.md（检查 .claude/skills/uicheck_pro/ 目录）');
  }

  if (missing.length > 0) {
    console.log('\n' + '!'.repeat(50));
    console.log('  缺少必要依赖：');
    missing.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
    console.log('\n  正在自动安装...\n');

    // 自动安装 Pillow
    if (missing.includes('Pillow')) {
      try {
        require('child_process').execSync('pip3 install --index-url https://pypi.org/simple Pillow', {
          stdio: 'inherit',
          timeout: 180000
        });
        console.log('✓ Pillow 安装成功\n');
      } catch (err) {
        console.log('✗ Pillow 安装失败:', err.message, '\n');
      }
    }

    // 自动安装 Claude CLI
    if (missing.includes('claude CLI')) {
      try {
        require('child_process').execSync('npm install @anthropic-ai/claude-agent-sdk-darwin-arm64', {
          stdio: 'inherit',
          timeout: 180000
        });
        // 创建符号链接
        const binDir = path.join(PROJECT_DIR, 'node_modules/.bin');
        if (!fs.existsSync(binDir)) {
          fs.mkdirSync(binDir, { recursive: true });
        }
        const linkPath = path.join(binDir, 'claude');
        if (!fs.existsSync(linkPath)) {
          fs.symlinkSync('../@anthropic-ai/claude-agent-sdk-darwin-arm64/claude', linkPath);
        }
        console.log('✓ Claude CLI 安装成功\n');
      } catch (err) {
        console.log('✗ Claude CLI 安装失败:', err.message, '\n');
      }
    }

    console.log('!'.repeat(50) + '\n');
  } else {
    console.log('[uicheck] 所有依赖检查通过');
  }
}
checkPrerequisites();

// ── 启动时打印关键路径和加载信息 ──
const loadedRefs = loadSkillContext('analysis');
console.log(`[uicheck] server version: ${SERVER_VERSION}`);
console.log(`[uicheck] SKILL_DIR = .claude/skills/uicheck_pro (${SKILL_DIR})`);
console.log(`[uicheck] SKILL_MD_PATH = ${SKILL_MD_PATH} (exists: ${fs.existsSync(SKILL_MD_PATH)})`);
console.log(`[uicheck] REF_DIR = ${REF_DIR}`);
console.log(`[uicheck] analysis reference files loaded: ${loadedRefs.map(f => f.name).join(', ')}`);
console.log(`[uicheck] OUTPUTS_DIR = ${OUTPUTS_DIR} (exists: ${fs.existsSync(OUTPUTS_DIR)})`);

function writeUICheckPromptDebugFile(stage, prompt) {
  fs.mkdirSync(UICHECK_PROMPT_DEBUG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(UICHECK_PROMPT_DEBUG_DIR, `${ts}-${stage}.md`);
  fs.writeFileSync(filePath, prompt, 'utf-8');
  return filePath;
}

function resolveUICheckFlow(files, latestUploadState = null) {
  const requestedMode = latestUploadState?.mode || 'single';
  const devFiles = files.filter(f => /^dev_/.test(f));
  const designFiles = files.filter(f => /^design_/.test(f));
  const hasFolderPairs = devFiles.length > 0 && designFiles.length > 0;

  if (requestedMode === 'folder') {
    return {
      mode: 'folder',
      flowName: 'folder-mode-disabled',
      flowFunction: 'buildUICheckPrompt(folder-mode)',
      isFolderMode: true,
      devFiles,
      designFiles,
      reason: 'upload-mode-folder'
    };
  }

  return {
    mode: 'single',
    flowName: 'single-page-uicheck-pro',
    flowFunction: 'buildUICheckPrompt(single-page) -> buildUICheckStep2AnalysisPrompt -> executeScreenshotScript',
    isFolderMode: false,
    devFiles,
    designFiles,
    reason: requestedMode === 'single' ? 'upload-mode-single' : (hasFolderPairs ? 'fallback-force-single' : 'default-single')
  };
}

function logUICheckRunMeta(stage, payload) {
  console.log(`[uicheck ${stage}] flow: ${payload.flowFunction || payload.flowName || ''}`);
  console.log(`[uicheck ${stage}] prompt file: ${payload.promptFilePath || ''}`);
  console.log(`[uicheck ${stage}] image refs: ${JSON.stringify(payload.imageRefs || [])}`);
  console.log(`[uicheck ${stage}] loaded refs: ${JSON.stringify(payload.referenceFiles || [])}`);
}


// Ensure directories exist
fs.mkdirSync(INPUTS_DIR, { recursive: true });
fs.mkdirSync(UICHECK_ANALYSIS_IMAGES_DIR, { recursive: true });

// Each upload type gets its own sub-directory to prevent cross-contamination
function getInputsDir(type) {
  const dir = path.join(INPUTS_DIR, type);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Parse JSON from Claude API's text output
function parseIssuesFromOutput(text) {
  // Try code block first
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed && (parsed.confirmed || parsed.suspected)) return parsed;
    } catch {}
  }
  // Try bare JSON object with confirmed/suspected keys
  const objMatch = text.match(/\{[\s\S]*"confirmed"[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed && (parsed.confirmed || parsed.suspected)) return parsed;
    } catch {}
  }
  // Fallback: flat array (legacy format)
  const arrMatch = text.match(/\[[\s\S]*"issue"[\s\S]*\]/);
  if (arrMatch) {
    try { return { confirmed: JSON.parse(arrMatch[0]), suspected: [] }; } catch {}
  }
  return null;
}

// Convert dev_y (0-100 percentage) to crop parameters (y ratio, height ratio)
function devYToCrop(devY, cropPercent) {
  const y = Math.max(0, Math.min(100, devY || 50));
  const halfH = cropPercent || 12;
  const cropY = Math.max(0, y - halfH);
  return { y: cropY / 100, h: (halfH * 2) / 100 };
}

// Crop a region around dev_y and draw a red box around the problem area
async function cropByDevY(imgPath, devY, box) {
  if (!fs.existsSync(imgPath) || devY === undefined || devY === null) return null;
  const meta = await sharp(imgPath).metadata();
  if (meta.width <= 0 || meta.height <= 0) return null;

  // Crop window: ~24% of image height centered on dev_y
  const { y: cropRatio, h: cropHRatio } = devYToCrop(devY, 12);
  const cropTop = Math.round(cropRatio * meta.height);
  const cropH = Math.max(Math.round(cropHRatio * meta.height), Math.round(meta.height * 0.1));

  // Build red box SVG overlay
  let overlaySvg = null;
  if (box && box.x !== undefined && box.y !== undefined && box.w !== undefined && box.h !== undefined) {
    // box values are percentages relative to the full image
    const bx = Math.round((box.x / 100) * meta.width);
    const by = Math.round((box.y / 100) * meta.height);
    const bw = Math.round((box.w / 100) * meta.width);
    const bh = Math.round((box.h / 100) * meta.height);
    // Box position relative to the cropped image
    const relX = bx;
    const relY = by - cropTop;
    if (relY + bh > 0 && relY < meta.height && relX + bw > 0 && relX < meta.width) {
      overlaySvg = Buffer.from(
        `<svg width="${meta.width}" height="${cropH}">
          <rect x="${Math.max(0, relX)}" y="${Math.max(0, relY)}"
                width="${Math.min(bw, meta.width - relX)}" height="${Math.min(bh, cropH - relY)}"
                fill="none" stroke="#ef4444" stroke-width="4" rx="4"/>
        </svg>`
      );
    }
  } else {
    // Fallback: draw a subtle red outline around the entire cropped image
    overlaySvg = Buffer.from(
      `<svg width="${meta.width}" height="${cropH}">
        <rect x="2" y="2" width="${meta.width - 4}" height="${cropH - 4}"
              fill="none" stroke="#fca5a5" stroke-width="2" stroke-dasharray="8,4" rx="4"/>
      </svg>`
    );
  }

  return sharp(imgPath)
    .extract({ left: 0, top: cropTop, width: meta.width, height: cropH })
    .resize({ height: 800, fit: 'inside' })
    .png()
    .toBuffer()
    .then(async (buf) => {
      const resizedMeta = await sharp(buf).metadata();
      // Scale the overlay to match the resized image
      const scaledSvg = overlaySvg.toString().replace(
        `<svg width="${meta.width}" height="${cropH}"`,
        `<svg width="${resizedMeta.width}" height="${resizedMeta.height}"`
      );
      return sharp(buf)
        .composite([{ input: Buffer.from(scaledSvg), top: 0, left: 0 }])
        .toBuffer()
        .then(b => 'data:image/png;base64,' + b.toString('base64'));
    })
    .catch(() => null);
}

// Extract final assistant text from claude stream-json NDJSON output
function extractTextFromStreamJson(rawLines) {
  let resultText = '';
  let assistantText = '';
  const lines = rawLines.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      // Check for result field (used by Claude CLI output format)
      if (obj?.type === 'result' && typeof obj.result === 'string' && obj.result.trim()) {
        resultText = obj.result.trim();
      }
      // Also check for content field (alternative format)
      if (obj?.type === 'result' && typeof obj.content === 'string' && obj.content.trim()) {
        resultText = obj.content.trim();
      }
      // Extract from assistant message chunks
      if (obj.role === 'assistant' && Array.isArray(obj.content)) {
        for (const c of obj.content) {
          if (c.type === 'text' && c.text) {
            assistantText += c.text;
          }
        }
      }
      // Also check message.content in assistant messages
      if (obj?.type === 'assistant' && obj?.message?.content) {
        for (const c of obj.message.content) {
          if (c.type === 'text' && c.text) {
            assistantText += c.text;
          }
        }
      }
    } catch {}
  }
  return resultText || assistantText;
}

function extractReadVerificationSection(text) {
  const content = String(text || '').trim();
  if (!content) return '';
  const lines = content.split(/\r?\n/);
  const collected = [];
  let inJsonBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```json/i.test(trimmed)) {
      inJsonBlock = true;
      break;
    }
    if (/^```/.test(trimmed)) continue;
    if (!trimmed) {
      if (collected.length > 0) collected.push('');
      continue;
    }
    collected.push(line);
  }
  return collected.join('\n').trim();
}

function isReadVerificationFailed(text) {
  return /读图验证失败[：:]/.test(String(text || ''));
}

// step: 'step1' (single design image) or 'step2' (dual image comparison)
function hasMeaningfulReadVerification(text, step) {
  const verification = extractReadVerificationSection(text);
  if (!verification || verification.length < 20) return false;
  if (step === 'step1') {
    // step1: single design image — just needs ANY meaningful image content description
    // Model should describe title/color/module visible in the image
    const signals = [
      /[\u4e00-\u9fa5]{2,}/, // at least some Chinese characters (page content)
    ];
    // Must have at least 30 chars of real content description
    return verification.length >= 30 && signals.every(regex => regex.test(verification));
  }
  // step2: dual image comparison
  const signals = [
    /开发稿|dev/i,
    /设计稿|design/i,
    /标题|顶部文字|顶部模块|文字|模块/,
    /主色|背景色|色调|颜色/,
  ];
  return signals.every(regex => regex.test(verification));
}

function ensureUICheckReadVerificationOrThrow(analysisOutput, step) {
  if (isReadVerificationFailed(analysisOutput)) {
    const failReason = analysisOutput.match(/读图验证失败[：:]\s*(.+)/)?.[1] || '未知原因';
    return { ok: false, reason: failReason, verification: extractReadVerificationSection(analysisOutput) };
  }
  if (!hasMeaningfulReadVerification(analysisOutput, step)) {
    return { ok: false, reason: '模型未返回完整读图验证信息，无法确认图片已被真实读取', verification: extractReadVerificationSection(analysisOutput) };
  }
  return { ok: true, reason: '', verification: extractReadVerificationSection(analysisOutput) };
}

// Parse design spec JSON from step 1 output
function parseDesignSpecFromOutput(text) {
  // Helper to clean JSON content that may have unescaped quotes inside string values
  function sanitizeJson(jsonStr) {
    // Replace Chinese curly quotes with straight ones
    return jsonStr
      .replace(/“/g, '"')
      .replace(/”/g, '"')
      .replace(/‘/g, "'")
      .replace(/’/g, "'");
  }

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(sanitizeJson(jsonMatch[1])); } catch {}
    // Fallback: try to parse despite errors using a lenient approach
    try {
      // Fix unescaped double quotes inside string values with a regex
      const fixed = jsonMatch[1]
        .replace(/“/g, '')
        .replace(/”/g, '')
        .replace(/[\u4e00-\u9fa5][\u201c\u201d]/g, (m) => m[0]);
      return JSON.parse(fixed);
    } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*"name"[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(sanitizeJson(arrMatch[0])); } catch {}
  }
  // Fallback: find any JSON-looking array
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first !== -1 && last > first) {
    try { return JSON.parse(sanitizeJson(text.slice(first, last + 1))); } catch {}
  }
  return null;
}

// Compress image by file size (not pixel dimensions) to prevent model read failure.
// Only reduces JPEG quality if file exceeds size threshold — pixel dimensions are preserved,
// so 1-2px level details remain visible to the model.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB threshold — images under this rarely trigger model read failures

async function createAnalysisImage(srcPath, suffix) {
  if (!srcPath || !fs.existsSync(srcPath)) return srcPath;
  const outDir = UICHECK_ANALYSIS_IMAGES_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(srcPath, path.extname(srcPath));
  const targetPath = path.join(outDir, `${base}-${suffix}.jpg`);
  try {
    const stat = fs.statSync(srcPath);
    if (stat.size <= MAX_IMAGE_BYTES) {
      // File is small enough — use original, no compression needed
      return srcPath;
    }
    // File too large: compress to JPEG at quality 85, keep original pixel dimensions
    console.log(`[uicheck analysis image] compressing ${Math.round(stat.size / 1024)}KB → jpeg q80 at original size`);
    await sharp(srcPath)
      .jpeg({ quality: 80, mozjpeg: false })
      .toFile(targetPath);
    const newStat = fs.statSync(targetPath);
    console.log(`[uicheck analysis image] compressed to ${Math.round(newStat.size / 1024)}KB`);
    return targetPath;
  } catch (err) {
    console.log('[uicheck analysis image] fallback to original:', err.message);
    return srcPath;
  }
}

// Resize dev image to match design image width (B端专用：消除宽度差异，减少比例感知误差)
// 等比缩放开发稿到设计稿宽度，只影响传给模型和截图脚本的分析图，不修改原始上传文件
async function resizeDevToMatchDesign(devPath, designPath, suffix) {
  if (!devPath || !designPath || !fs.existsSync(devPath) || !fs.existsSync(designPath)) return devPath;
  try {
    const designMeta = await sharp(designPath).metadata();
    const devMeta = await sharp(devPath).metadata();
    const targetWidth = designMeta.width;
    if (!targetWidth || devMeta.width === targetWidth) {
      console.log(`[uicheck resize] dev width already matches design (${devMeta.width}px), skipping`);
      return devPath;
    }
    const outDir = UICHECK_ANALYSIS_IMAGES_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.basename(devPath, path.extname(devPath));
    const targetPath = path.join(outDir, `${base}-${suffix}-resized.jpg`);
    if (devMeta.width > targetWidth * 2) {
      console.warn(`[uicheck resize] WARNING: design width (${targetWidth}px) is much smaller than dev (${devMeta.width}px), downscaling`);
    }
    await sharp(devPath)
      .resize({ width: targetWidth, withoutEnlargement: false })
      .jpeg({ quality: 85 })
      .toFile(targetPath);
    const newMeta = await sharp(targetPath).metadata();
    console.log(`[uicheck resize] dev ${devMeta.width}x${devMeta.height} → ${newMeta.width}x${newMeta.height} (matched design width ${targetWidth}px)`);
    return targetPath;
  } catch (err) {
    console.log('[uicheck resize] fallback to original dev:', err.message);
    return devPath;
  }
}

function isUICheckImageFile(file) {
  return /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(file || '');
}

async function selectSinglePageUICheckFiles(files, typeDir, preferState = null) {
  const imageFiles = (files || []).filter(isUICheckImageFile);
  const withStats = await Promise.all(imageFiles.map(async (file) => {
    const fullPath = path.join(typeDir, file);
    try {
      const stat = await fs.promises.stat(fullPath);
      return { file, fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      return { file, fullPath, mtimeMs: 0, size: 0 };
    }
  }));

  const sortedDesc = withStats.slice().sort((a, b) => b.mtimeMs - a.mtimeMs);
  const findByRegexNewest = (regex) => sortedDesc.find(item => regex.test(item.file));
  const devCandidates = sortedDesc.filter(item => /^dev[_-]/i.test(item.file) || /(^|[_-])dev([_-]|\.|$)/i.test(item.file));
  const designCandidates = sortedDesc.filter(item => /^design[_-]/i.test(item.file) || /(^|[_-])design([_-]|\.|$)/i.test(item.file));

  const preferDev = preferState?.devPath ? path.basename(preferState.devPath) : '';
  const preferDesign = preferState?.designPath ? path.basename(preferState.designPath) : '';

  let devPick = sortedDesc.find(item => item.file === preferDev)
    || findByRegexNewest(/^dev_screenshot\./i)
    || findByRegexNewest(/dev_screenshot/i)
    || devCandidates[0]
    || sortedDesc[0]
    || null;

  let designPick = sortedDesc.find(item => item.file === preferDesign)
    || findByRegexNewest(/^design_mockup\./i)
    || findByRegexNewest(/design_mockup/i)
    || designCandidates.find(item => item.file !== (devPick?.file || ''))
    || sortedDesc.find(item => item.file !== (devPick?.file || ''))
    || null;

  if (devPick && !designPick) {
    designPick = sortedDesc.find(item => item.file !== devPick.file) || null;
  }

  return {
    devFile: devPick?.file || '',
    designFile: designPick?.file || '',
    imageFiles,
    devFiles: devCandidates.map(item => item.file),
    designFiles: designCandidates.map(item => item.file),
    sortedByMtimeDesc: sortedDesc.map(item => ({
      file: item.file,
      path: item.fullPath,
      mtimeMs: item.mtimeMs,
      size: item.size
    }))
  };
}

async function getImageInfo(imgPath) {
  if (!imgPath || !fs.existsSync(imgPath)) return null;
  try {
    const [meta, stat] = await Promise.all([sharp(imgPath).metadata(), fs.promises.stat(imgPath)]);
    return {
      path: imgPath,
      width: meta.width || 0,
      height: meta.height || 0,
      size: stat.size
    };
  } catch (err) {
    return {
      path: imgPath,
      width: 0,
      height: 0,
      size: 0,
      error: err.message
    };
  }
}

async function appendUICheckRuntimeDebug(data) {
  const record = {
    ts: new Date().toISOString(),
    ...data
  };
  let existing = [];
  try {
    if (fs.existsSync(UICHECK_RUNTIME_DEBUG_PATH)) {
      const raw = fs.readFileSync(UICHECK_RUNTIME_DEBUG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch {}
  existing.push(record);
  if (existing.length > 200) existing = existing.slice(-200);
  fs.writeFileSync(UICHECK_RUNTIME_DEBUG_PATH, JSON.stringify(existing, null, 2));
}

async function writeUICheckLatestUploadState(payload) {
  fs.writeFileSync(UICHECK_UPLOAD_STATE_PATH, JSON.stringify(payload, null, 2));
}

function readUICheckLatestUploadState() {
  try {
    if (!fs.existsSync(UICHECK_UPLOAD_STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(UICHECK_UPLOAD_STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

async function logImageInfo(label, imgPath) {
  if (!imgPath) {
    console.log(`[uicheck image] ${label}: empty path`);
    return null;
  }
  if (!fs.existsSync(imgPath)) {
    console.log(`[uicheck image] ${label}: missing file path=${imgPath}`);
    return null;
  }
  const info = await getImageInfo(imgPath);
  if (info?.error) {
    console.log(`[uicheck image] ${label}: metadata error path=${imgPath} error=${info.error}`);
  } else {
    console.log(`[uicheck image] ${label}: path=${imgPath} width=${info?.width || 0} height=${info?.height || 0} size=${info?.size || 0}`);
  }
  return info;
}

// Build step 2 analysis prompt for single-page uicheck (issue detection only)
// Backend reads skill reference files and injects into prompt — model does NOT need to Read skill files
function buildUICheckStep2AnalysisPrompt(designSpec, devPath, designPath, bgPath, pageType = 'c') {
  const specText = designSpec.map(m =>
    (m.order || '') + '. ' + String(m.name || '') + '：' + String(m.content || '') + '，视觉特征：' + String(m.visual || '')
  ).join('\n');

  const skillMarkdown = loadUICheckSkillMarkdown(pageType);
  const skillCtx = loadSkillContext('analysis', pageType);
  const inlineSkill = skillMarkdown ? `\n## uicheck_pro SKILL.md（已内嵌，无需额外读取）\n${skillMarkdown}\n` : '';
  let inlineRules = '';
  for (const f of skillCtx) {
    inlineRules += `\n### ${f.name}\n${f.content}\n`;
  }

  return `你是一个资深的设计走查助手，负责对比开发稿截图和设计稿截图的视觉差异。

## 图片输入（必须按附件读取，不要把路径当普通文本）
开发稿：
${toClaudeFileRef(devPath)}

设计稿：
${toClaudeFileRef(designPath)}

## ⚠️ 必须先完成硬读图验证（严格执行）
- 先分别读取上面的两张图片
- 如果任意一张图片没有被当成真实视觉输入读取，立即输出“读图验证失败：[原因]”并停止
- 禁止在读图失败时继续输出问题 JSON、issue table 或任何问题列表

### 硬读图验证输出要求
请先输出“读图验证”小节，并严格包含以下内容：
1. 开发稿真实可见的页面标题/顶部文字（逐字引用）
2. 开发稿顶部主色、页面主背景色、顶部第一个模块名称
3. 设计稿真实可见的页面标题/顶部文字（逐字引用）
4. 设计稿顶部主色、页面主背景色、顶部第一个模块名称
5. 回答“开发稿和设计稿是否为两张不同图片：是/否”
6. 回答“这两张图是否描述同一个页面或同一组模块：是/否 + 理由”

如果任意一项无法基于图片直接回答，输出：
“读图验证失败：[具体原因]”
然后停止，不要输出 JSON。

## 图片身份铁则
- 开发稿截图 = 代码实现产物（路径：${devPath}）
- 设计稿截图 = 设计目标效果图（路径：${designPath}）
- 两张图禁止交换身份，先分别识别两张图中的同一对象，再比较差异
- 只基于这两张图做判断，不要引入其他图片或历史上下文
- 开发稿中的文字/模块名称必须从开发稿图片中实际读取，不要从设计稿推测
- 设计稿中的文字/模块名称必须从设计稿图片中实际读取，不要从开发稿推测

## 走查规则（已内嵌，无需额外读取）
${inlineSkill}
## reference 规则补充（已内嵌，无需额外读取）
${inlineRules}

### 输出限制
- 最多输出 15 条问题（confirmed + suspected 合计）
- 疑似问题不要过于保守——只要两图间有任何可见的视觉差异迹象，且不是明确的动态数据差异，都应该纳入 suspected，宁可多报也不要漏报
- 坐标使用 0.0-1.0 比例
- 先识别同一个对象，再分别给 dev/design 坐标，禁止位置投影
- 不得框整图、不得框错对象、不得把 design 的位置投影到 dev
- 每条问题的 problem 必须描述你在两张图中分别看到的具体差异，不允许模糊描述

### 截图坐标强制规则（必须遵守）
- **devCropRegion 和 designCropRegion 必须完全相同**：两张截图的上下文视窗必须对齐，用户才能左右对比，不同的 CropRegion 会导致截图范围错位，无法对比。
- **devBox 和 designBox 坐标必须不同（除非两图该元素位置完全一致）**：你必须分别在 dev 图和 design 图中独立定位问题元素的精确位置，而不是复制同一个坐标。同一个元素在两张图里的实际位置往往有偏差，框的坐标应该反映各自图片中的真实位置。
- 合格示例：标题"创作任务"在 dev 图中偏右（devBox.left=0.35），在 design 图中居中（designBox.left=0.28），两个 Box 坐标不同是正确的。
- 不合格示例：devBox 和 designBox 完全一样——说明你没有独立定位，而是复制了坐标，这会导致一边框准另一边框歪。
- 不合格示例：dev CropRegion = {top:0.47, bottom:0.73}，design CropRegion = {top:0.43, bottom:0.51}，两个截图窗口完全不同——禁止这样输出。

### 动态数据禁止上报（强制）
以下差异**绝对不允许出现在输出 JSON 中**（confirmed 和 suspected 都不行）：
- 用户昵称不同、用户头像不同
- 金额/数值/时间/日期不同
- 任务进度数字不同（如 0/1）
- 运营配置文案不同
只有当**结构本身**发生了变化（有 vs 无某个元素）时才可以报，但不能描述动态内容的具体差异。

## 设计稿的页面结构清单（设计目标）
${specText}

${bgPath ? '## 背景信息\n' + bgPath + '\n' : ''}

## 最终输出

先输出读图验证文字，然后输出一个 JSON 代码块：

\`\`\`json
{
  "confirmed": [],
  "suspected": []
}
\`\`\`

confirmed 和 suspected 每条问题必须包含以下字段：
- id, problem, suggestion, priority(P0/P1/P2), status, location
- devCropRegion: {top, bottom, left, right}（0.0-1.0比例）
- devBox: {top, bottom, left, right}（0.0-1.0比例）
- designCropRegion: {top, bottom, left, right}（0.0-1.0比例）
- designBox: {top, bottom, left, right}（0.0-1.0比例）

suspected 还需要：reason, basis, whyNotConfirmed, verifySuggestion`;
}

// Generate Python script for cropping and drawing red boxes on screenshots
// Uses CropRegion (context window for screenshot) and Box (exact element red box) separately
function generateScreenshotScript(issueData, devPath, designPath) {
  const outputDir = OUTPUTS_DIR;
  
  // Load screenshot rules from disk and embed as comment for reference
  const screenshotRules = loadSkillContext('screenshot');
  let rulesComment = '';
  for (const f of screenshotRules) {
    rulesComment += `# --- ${f.name} ---\n# ${f.content.replace(/\n/g, '\n# ')}\n`;
  }

  const script = `# -*- coding: utf-8 -*-
import os, json
from PIL import Image, ImageDraw

os.makedirs("${outputDir}", exist_ok=True)

dev_img = Image.open("${devPath}")
design_img = Image.open("${designPath}")
dev_w, dev_h = dev_img.size
design_w, design_h = design_img.size

issues = ${JSON.stringify(issueData)}

RED = "#ef4444"
PAD_BOX = 8   # padding inside crop for box drawing
LINE_W = 3    # red box stroke width

${rulesComment}

for issue in issues:
    id = issue["id"]
    
    # ── CropRegion: larger context window for the screenshot ──
    dev_crop_r = issue.get("devCropRegion") or issue.get("devRegion") or {"top": 0.0, "bottom": 1.0, "left": 0.0, "right": 1.0}
    design_crop_r = issue.get("designCropRegion") or issue.get("designRegion") or {"top": 0.0, "bottom": 1.0, "left": 0.0, "right": 1.0}
    
    # ── BoxRegion: exact element location for the red box ──
    # If no separate box, use cropRegion as fallback (means entire crop is the problem area)
    dev_box_r = issue.get("devBox") or dev_crop_r
    design_box_r = issue.get("designBox") or design_crop_r
    
    # ── Dev screenshot: crop context + draw red box ──
    dc_top = int(dev_h * dev_crop_r["top"])
    dc_bottom = int(dev_h * dev_crop_r["bottom"])
    dc_left = int(dev_w * dev_crop_r["left"])
    dc_right = int(dev_w * dev_crop_r["right"])
    dev_crop = dev_img.crop((dc_left, dc_top, dc_right, dc_bottom))
    dev_draw = ImageDraw.Draw(dev_crop)
    
    # Box position relative to the cropped image
    db_top_px = int(dev_h * dev_box_r["top"]) - dc_top
    db_bottom_px = int(dev_h * dev_box_r["bottom"]) - dc_top
    db_left_px = int(dev_w * dev_box_r["left"]) - dc_left
    db_right_px = int(dev_w * dev_box_r["right"]) - dc_left
    # Clamp to crop bounds
    db_top_px = max(0, db_top_px)
    db_left_px = max(0, db_left_px)
    db_bottom_px = min(dc_bottom - dc_top, db_bottom_px)
    db_right_px = min(dc_right - dc_left, db_right_px)
    
    # Only draw box if it's not the entire crop (i.e., box != cropRegion)
    if dev_box_r != dev_crop_r:
        dev_draw.rounded_rectangle(
            [db_left_px + PAD_BOX, db_top_px + PAD_BOX, db_right_px - PAD_BOX, db_bottom_px - PAD_BOX],
            radius=4, outline=RED, width=LINE_W
        )
    else:
        # Full-area box: just draw a subtle dashed border around entire crop
        cw, ch = dc_right - dc_left, dc_bottom - dc_top
        dev_draw.rounded_rectangle(
            [4, 4, cw - 4, ch - 4],
            radius=6, outline="#fca5a5", width=2
        )
    dev_crop.save("${outputDir}/issue_" + str(id) + "_dev.png")
    
    # ── Design screenshot: crop context + draw red box ──
    ds_top = int(design_h * design_crop_r["top"])
    ds_bottom = int(design_h * design_crop_r["bottom"])
    ds_left = int(design_w * design_crop_r["left"])
    ds_right = int(design_w * design_crop_r["right"])
    design_crop = design_img.crop((ds_left, ds_top, ds_right, ds_bottom))
    design_draw = ImageDraw.Draw(design_crop)
    
    # Box position relative to the cropped image
    dsb_top_px = int(design_h * design_box_r["top"]) - ds_top
    dsb_bottom_px = int(design_h * design_box_r["bottom"]) - ds_top
    dsb_left_px = int(design_w * design_box_r["left"]) - ds_left
    dsb_right_px = int(design_w * design_box_r["right"]) - ds_left
    dsb_top_px = max(0, dsb_top_px)
    dsb_left_px = max(0, dsb_left_px)
    dsb_bottom_px = min(ds_bottom - ds_top, dsb_bottom_px)
    dsb_right_px = min(ds_right - ds_left, dsb_right_px)
    
    if design_box_r != design_crop_r:
        design_draw.rounded_rectangle(
            [dsb_left_px + PAD_BOX, dsb_top_px + PAD_BOX, dsb_right_px - PAD_BOX, dsb_bottom_px - PAD_BOX],
            radius=4, outline=RED, width=LINE_W
        )
    else:
        cw, ch = ds_right - ds_left, ds_bottom - ds_top
        design_draw.rounded_rectangle(
            [4, 4, ch - 4, cw - 4],
            radius=6, outline="#fca5a5", width=2
        )
    design_crop.save("${outputDir}/issue_" + str(id) + "_design.png")

print("DONE")
`;
  return script;
}

// Flatten issues from both confirmed and suspected into a flat array for Python
function flattenIssueData(issueData) {
  return [...(issueData.confirmed || []), ...(issueData.suspected || [])];
}

// ── Node.js screenshot generation using sharp (primary, no Python dependency) ──
async function generateIssueScreenshotsWithSharp(issueData, devPath, designPath) {
  const PAD_BOX = 8;
  const LINE_W = 3;
  const RED = '#ef4444';
  const SUBTLE = '#fca5a5';

  const outputDir = OUTPUTS_DIR;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const devMeta = await sharp(devPath).metadata();
  const designMeta = await sharp(designPath).metadata();
  const devW = devMeta.width, devH = devMeta.height;
  const designW = designMeta.width, designH = designMeta.height;

  const issues = flattenIssueData(issueData);

  for (const issue of issues) {
    const id = String(issue.id || '').trim();

    // ── Process dev screenshot ──
    {
      const cropR = issue.devCropRegion || issue.devRegion || { top: 0, bottom: 1, left: 0, right: 1 };
      const boxR = issue.devBox || cropR;

      const dcTop = Math.round(devH * cropR.top);
      const dcBottom = Math.round(devH * cropR.bottom);
      const dcLeft = Math.round(devW * cropR.left);
      const dcRight = Math.round(devW * cropR.right);
      const cropW = dcRight - dcLeft;
      const cropH = dcBottom - dcTop;

      // Box position relative to the cropped image
      let dbTop = Math.round(devH * boxR.top) - dcTop;
      let dbBottom = Math.round(devH * boxR.bottom) - dcTop;
      let dbLeft = Math.round(devW * boxR.left) - dcLeft;
      let dbRight = Math.round(devW * boxR.right) - dcLeft;
      // Clamp
      dbTop = Math.max(0, dbTop);
      dbLeft = Math.max(0, dbLeft);
      dbBottom = Math.min(cropH, dbBottom);
      dbRight = Math.min(cropW, dbRight);

      // Crop the region
      let devCropBuf = await sharp(devPath)
        .extract({ left: dcLeft, top: dcTop, width: cropW, height: cropH })
        .toBuffer();

      // Draw box overlay via SVG composite
      if (JSON.stringify(boxR) !== JSON.stringify(cropR)) {
        // Precise element box (red, solid)
        const svgOverlay = `<svg width="${cropW}" height="${cropH}">
          <rect x="${dbLeft + PAD_BOX}" y="${dbTop + PAD_BOX}" width="${dbRight - dbLeft - 2 * PAD_BOX}" height="${dbBottom - dbTop - 2 * PAD_BOX}"
            rx="4" ry="4" fill="none" stroke="${RED}" stroke-width="${LINE_W}"/>
        </svg>`;
        devCropBuf = await sharp(devCropBuf)
          .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
          .png()
          .toBuffer();
      } else {
        // Full-area subtle border
        const svgOverlay = `<svg width="${cropW}" height="${cropH}">
          <rect x="4" y="4" width="${cropW - 8}" height="${cropH - 8}"
            rx="6" ry="6" fill="none" stroke="${SUBTLE}" stroke-width="2"/>
        </svg>`;
        devCropBuf = await sharp(devCropBuf)
          .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
          .png()
          .toBuffer();
      }

      const devOutPath = path.join(outputDir, `issue_${id}_dev.png`);
      fs.writeFileSync(devOutPath, devCropBuf);
      console.log(`[screenshot-sharp] saved ${devOutPath}`);
    }

    // ── Process design screenshot ──
    {
      const cropR = issue.designCropRegion || issue.designRegion || { top: 0, bottom: 1, left: 0, right: 1 };
      const boxR = issue.designBox || cropR;

      const dsTop = Math.round(designH * cropR.top);
      const dsBottom = Math.round(designH * cropR.bottom);
      const dsLeft = Math.round(designW * cropR.left);
      const dsRight = Math.round(designW * cropR.right);
      const cropW = dsRight - dsLeft;
      const cropH = dsBottom - dsTop;

      let dsbTop = Math.round(designH * boxR.top) - dsTop;
      let dsbBottom = Math.round(designH * boxR.bottom) - dsTop;
      let dsbLeft = Math.round(designW * boxR.left) - dsLeft;
      let dsbRight = Math.round(designW * boxR.right) - dsLeft;
      // Clamp
      dsbTop = Math.max(0, dsbTop);
      dsbLeft = Math.max(0, dsbLeft);
      dsbBottom = Math.min(cropH, dsbBottom);
      dsbRight = Math.min(cropW, dsbRight);

      let designCropBuf = await sharp(designPath)
        .extract({ left: dsLeft, top: dsTop, width: cropW, height: cropH })
        .toBuffer();

      if (JSON.stringify(boxR) !== JSON.stringify(cropR)) {
        const svgOverlay = `<svg width="${cropW}" height="${cropH}">
          <rect x="${dsbLeft + PAD_BOX}" y="${dsbTop + PAD_BOX}" width="${dsbRight - dsbLeft - 2 * PAD_BOX}" height="${dsbBottom - dsbTop - 2 * PAD_BOX}"
            rx="4" ry="4" fill="none" stroke="${RED}" stroke-width="${LINE_W}"/>
        </svg>`;
        designCropBuf = await sharp(designCropBuf)
          .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
          .png()
          .toBuffer();
      } else {
        const svgOverlay = `<svg width="${cropW}" height="${cropH}">
          <rect x="4" y="4" width="${cropW - 8}" height="${cropH - 8}"
            rx="6" ry="6" fill="none" stroke="${SUBTLE}" stroke-width="2"/>
        </svg>`;
        designCropBuf = await sharp(designCropBuf)
          .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
          .png()
          .toBuffer();
      }

      const designOutPath = path.join(outputDir, `issue_${id}_design.png`);
      fs.writeFileSync(designOutPath, designCropBuf);
      console.log(`[screenshot-sharp] saved ${designOutPath}`);
    }
  }

  console.log('[screenshot-sharp] DONE - all issue screenshots generated');
}

// Execute Python screenshot script directly (fallback if sharp fails)
async function executeScreenshotScript(scriptContent) {
  const scriptPath = '/tmp/uicheck-screenshot-script.py';
  fs.writeFileSync(scriptPath, scriptContent);
  
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scriptPath], {
      cwd: PARENT_DIR,
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    
    const timer = setTimeout(() => {
      py.kill('SIGKILL');
      reject(new Error('Screenshot script timeout (60s)'));
    }, 60000);
    
    py.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.includes('DONE')) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`Screenshot script failed (code ${code}): ${stderr.slice(0, 500)}`));
      }
    });
    
    py.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}


// [REMOVED] buildUICheckStep2ScreenshotPrompt — Phase B now uses local Python directly
// Screenshots are generated locally using Node.js sharp, no external tool needed


function attachGeneratedIssueImages(issueData) {
  const enrich = (items = []) => items.map((issue) => {
    const id = String(issue.id || '').trim();
    const devPath = path.join(OUTPUTS_DIR, `issue_${id}_dev.png`);
    const designPath = path.join(OUTPUTS_DIR, `issue_${id}_design.png`);
    const devImage = path.relative(PARENT_DIR, devPath);
    const designImage = path.relative(PARENT_DIR, designPath);
    const images = fs.existsSync(devPath) && fs.existsSync(designPath)
      ? [devImage, designImage]
      : (issue.images || []);
    return { ...issue, images };
  });

  return {
    confirmed: enrich(issueData?.confirmed),
    suspected: enrich(issueData?.suspected)
  };
}


// Generate issue table from Claude API output (for both single-page step 2 and folder mode)
async function generateIssueTable(fullOutput, files, typeDir, isFolderMode, res) {
  try {
    const data = parseIssuesFromOutput(fullOutput);
    if (!data) return;

    async function imageToBase64(imgPath) {
      // Resolve relative paths from PARENT_DIR (server cwd may be designer-platform)
      const resolvedPath = imgPath.startsWith('/') ? imgPath : path.join(PARENT_DIR, imgPath);
      if (!resolvedPath || !fs.existsSync(resolvedPath)) return null;
      try {
        const buf = fs.readFileSync(resolvedPath);
        return 'data:image/png;base64,' + buf.toString('base64');
      } catch { return null; }
    }

    async function buildRows(items) {
      const rows = [];
      for (const issue of items) {
        let devImg = null, designImg = null;

        // New SKILL format: images array of paths (Claude (kimi-k2.5) already cropped + boxed)
        if (issue.images && issue.images.length >= 2) {
          devImg = await imageToBase64(issue.images[0]);
          designImg = await imageToBase64(issue.images[1]);
          console.log(`[uicheck buildRows] ${issue.id}: images=${JSON.stringify(issue.images)} devImg=${devImg ? 'YES('+devImg.length+')' : 'NULL'} designImg=${designImg ? 'YES('+designImg.length+')' : 'NULL'}`);
        }
        // Fallback: legacy format with dev_y coordinate
        else if (!isFolderMode) {
          const devFile = files.find(f => /dev_screenshot/i.test(f));
          const designFile = files.find(f => /design_mockup/i.test(f));
          if (devFile && issue.dev_y !== undefined) {
            devImg = await cropByDevY(path.join(typeDir, devFile), issue.dev_y);
          }
          if (designFile && issue.dev_y !== undefined) {
            designImg = await cropByDevY(path.join(typeDir, designFile), issue.dev_y);
          }
        }

        // Map both formats to unified row schema
        rows.push({
          id: issue.id || '',
          page: issue.page || '',
          issue: issue.issue || '',
          problem: issue.problem || issue.issue || '',
          location: issue.location || '',
          severity: issue.severity || 'medium',
          priority: issue.priority || (issue.severity === 'high' ? 'P0' : issue.severity === 'low' ? 'P2' : 'P1'),
          status: issue.status || (isFolderMode ? '待修改' : '待修改'),
          confidence: issue.confidence || '',
          suspectLevel: issue.suspectLevel || '',
          description: issue.description || issue.problem || '',
          suggestion: issue.suggestion || '',
          reason: issue.reason || '',
          basis: issue.basis || '',
          whyNotConfirmed: issue.whyNotConfirmed || '',
          impact: issue.impact || '',
          verifySuggestion: issue.verifySuggestion || '',
          devImg,
          designImg
        });
      }
      return rows;
    }

    // Send confirmed issues table
    if (data.confirmed && data.confirmed.length > 0) {
      const confirmedRows = await buildRows(data.confirmed);
      res.write(`data: ${JSON.stringify({ type: 'table', tableType: 'confirmed', rows: confirmedRows })}\n\n`);
      console.log(`[uicheck] generated ${confirmedRows.length} confirmed rows`);
    }

    // Send suspected issues table
    if (data.suspected && data.suspected.length > 0) {
      const suspectedRows = await buildRows(data.suspected);
      res.write(`data: ${JSON.stringify({ type: 'table', tableType: 'suspected', rows: suspectedRows })}\n\n`);
      console.log(`[uicheck] generated ${suspectedRows.length} suspected rows`);
    }
  } catch (err) {
    console.log('[uicheck] table generation error:', err.message);
  }
}

// Configure multer - destination is set per-request in the upload handler
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getInputsDir(req.params.type || 'default');
    console.log(`[storage] type=${req.params.type}, dir=${dir}`);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
    fieldSize: 120 * 1024 * 1024
  }
});

app.use(express.static(PROJECT_DIR));
app.get('/', (req, res) => res.redirect('/uicheck.html'));

// 返回 CLI 信息
app.get('/api/cli-info', (req, res) => {
  const { cliPath, tool } = getCliPath();
  res.json({
    tool,
    cliPath,
    availableModels: tool === 'claude'
      ? ['all']  // Claude CLI 支持所有模型
      : ['gpt-5.5', 'gpt-5.4', 'gpt-4o', 'gpt-4-turbo']  // Codex 只支持 GPT
  });
});

// 全局 CORS - Figma iframe 需要跨域访问 localhost
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '50mb' }));

// 设置 API 配置
app.post('/api/set-api-config', (req, res) => {
  const { provider, apiKey, baseUrl, model } = req.body;

  if (!apiKey) {
    return res.status(400).json({ ok: false, error: 'API 密钥不能为空' });
  }

  currentApiConfig = { provider, apiKey, baseUrl, model };
  console.log('[API] 已设置自定义 API 配置:', provider, 'model:', model);
  res.json({ ok: true, message: 'API 配置已保存' });
});

// Upload endpoint - supports both file upload and URL content fetching
app.post('/api/upload/:type', async (req, _res, next) => {
  const type = req.params.type;
  const typeDir = getInputsDir(type);
  // Clean old input files before multer writes new ones
  const existingFiles = fs.readdirSync(typeDir);
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(typeDir, file));
  }
  console.log(`[${type}] cleaned ${existingFiles.length} old files from ${typeDir}`);
  // Also clean old screenshot outputs (all files in outputs directory)
  if (type === 'uicheck') {
    const outputsDir = OUTPUTS_DIR;
    if (fs.existsSync(outputsDir)) {
      const oldFiles = fs.readdirSync(outputsDir);
      for (const f of oldFiles) {
        fs.unlinkSync(path.join(outputsDir, f));
      }
      console.log(`[uicheck] cleaned ${oldFiles.length} old files from ${outputsDir}`);
    }
  }
  next();
}, upload.array('files', 10), async (req, res) => {
  const { type } = req.params;
  const typeDir = getInputsDir(type);
  let content = req.body.content || '';
  const persona = req.body.persona || '';
  const taskDesc = req.body.taskDesc || '';
  let newFiles = (req.files || []).map(f => ({ path: f.path, originalname: f.originalname }));

  // Handle URL input: fetch content and save as text file
  const isUrl = req.body.isUrl === 'true' || req.body.isUrl === true;
  if (content && newFiles.length === 0) {
    if (isUrl) {
      const pageContent = await fetchUrlContent(content);
      if (pageContent) {
        const fileName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-prd.txt';
        const filePath = path.join(typeDir, fileName);
        fs.writeFileSync(filePath, `Source URL: ${content}\n\n${pageContent}`, 'utf-8');
        newFiles = [{ path: filePath, originalname: fileName }];
        console.log(`[${type}] fetched URL and saved as ${fileName}`);
      } else {
        return res.status(400).json({ ok: false, error: '无法获取该 URL 的内容，请尝试直接粘贴文本' });
      }
    } else {
      // Browser fetched or direct paste
      const sourceUrl = req.body.sourceUrl || '';
      const fileName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-prd.txt';
      const filePath = path.join(typeDir, fileName);
      const header = sourceUrl ? `Source URL: ${sourceUrl}\n\n` : '';
      fs.writeFileSync(filePath, `${header}${content}`, 'utf-8');
      newFiles = [{ path: filePath, originalname: fileName }];
      console.log(`[${type}] saved fetched/pasted text as ${fileName} (${content.length} bytes)`);
    }
  }

  if (type === 'uicheck') {
    const fileNames = fs.readdirSync(typeDir);
    const selection = await selectSinglePageUICheckFiles(fileNames, typeDir, null);
    const devPath = selection.devFile ? path.join(typeDir, selection.devFile) : '';
    const designPath = selection.designFile ? path.join(typeDir, selection.designFile) : '';
    const devInfo = await getImageInfo(devPath);
    const designInfo = await getImageInfo(designPath);

    await writeUICheckLatestUploadState({
      ts: new Date().toISOString(),
      type,
      mode: req.body.mode || 'single',
      typeDir,
      files: fileNames,
      selection,
      devPath,
      designPath,
      devInfo,
      designInfo
    });

    await appendUICheckRuntimeDebug({
      phase: 'upload-complete',
      files: fileNames,
      devFiles: selection.devFiles,
      designFiles: selection.designFiles,
      selected: {
        devFile: selection.devFile,
        designFile: selection.designFile,
        devPath,
        designPath
      },
      imageInfo: {
        dev: devInfo,
        design: designInfo
      }
    });
  }

  res.json({ ok: true, type, content, persona, taskDesc, files: newFiles });
});

// Analyze endpoint (SSE streaming)
// Allowed vision models for uicheck
const UICHECK_VISION_MODELS = {
  'glm-5.1': 'glm-5.1',
  'kimi-k2.5': 'kimi-k2.5',
  'claude': 'claude',
  'claude-opus-4-7-20250705': 'claude-opus-4-7-20250705',
  'claude-sonnet-4-6-20250514': 'claude-sonnet-4-6-20250514',
  'gpt-5.5': 'gpt-5.5',
  'gpt-5.4': 'gpt-5.4',
  'gemini-3.1-pro': 'gemini-3.1-pro'
};
const UICHECK_DEFAULT_MODEL = 'gpt-5.4';

app.get('/api/analyze/:type', async (req, res) => {
  const { type } = req.params;
  const visionModel = req.query.model && UICHECK_VISION_MODELS[req.query.model]
    ? req.query.model
    : UICHECK_DEFAULT_MODEL;
  const pageType = req.query.pageType === 'b' ? 'b' : 'c';
  console.log('[analyze] type:', type, 'vision model:', visionModel, 'pageType:', pageType);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const prompts = {
    uicheck: buildUICheckPrompt
  };

  const buildPrompt = prompts[type];
  if (!buildPrompt) {
    res.write(`data: ${JSON.stringify({ type: 'error', content: '不支持的功能类型: ' + type })}\n\n`);
    return res.end();
  }

  const typeDir = getInputsDir(type);
  const files = fs.readdirSync(typeDir);
  if (files.length === 0) {
    res.write(`data: ${JSON.stringify({ type: 'error', content: '请先上传文件后再开始分析' })}\n\n`);
    return res.end();
  }

  // Clean all non-current-type input dirs and uicheck outputs on every analyze run
  for (const subDir of fs.readdirSync(INPUTS_DIR)) {
    const subPath = path.join(INPUTS_DIR, subDir);
    if (subDir !== type && fs.statSync(subPath).isDirectory()) {
      for (const f of fs.readdirSync(subPath)) fs.unlinkSync(path.join(subPath, f));
      console.log(`[analyze] cleaned old files from inputs/${subDir}`);
    }
  }
  if (type === 'uicheck' && fs.existsSync(OUTPUTS_DIR)) {
    for (const f of fs.readdirSync(OUTPUTS_DIR)) fs.unlinkSync(path.join(OUTPUTS_DIR, f));
    console.log(`[analyze] cleaned old files from outputs/`);
  }

  // Validate content length - only for PRD type to prevent analyzing empty/fetch-failed content
  if (type === 'prd') {
    const mainFile = files.find(f => /prd\.txt$/i.test(f)) || files[0];
    const filePath = path.join(typeDir, mainFile);
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    // Strip URL header to check actual content
    const actualContent = fileContent.replace(/^Source URL:.*?\n\n?/s, '').trim();
    if (actualContent.length < 500) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'PRD 内容过短（' + actualContent.length + ' 字符，链接无法访问或抓取内容不足），请切换到文本粘贴模式手动复制内容' })}\n\n`);
      return res.end();
    }
  }

  console.log(`[${type}] analyzing files:`, files);

  let uicheckStep1Context = null;
  let uicheckFlow = null;
  if (type === 'uicheck') {
    const latestUploadState = readUICheckLatestUploadState();
    uicheckFlow = resolveUICheckFlow(files, latestUploadState);
    console.log('[uicheck] selected flow:', JSON.stringify(uicheckFlow, null, 2));

    if (uicheckFlow.mode === 'folder') {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'uicheck 当前已禁用旧 folder-mode 流程，请切回单页面上传，两张图会走 single-page uicheck_pro 流程。' })}\n\n`);
      return res.end();
    }

    const selection = await selectSinglePageUICheckFiles(files, typeDir, latestUploadState);
    const devFile = selection.devFile;
    const designFile = selection.designFile;
    const devPath = devFile ? path.join(typeDir, devFile) : '';
    const designPath = designFile ? path.join(typeDir, designFile) : '';
    const devInfo = await logImageInfo('step1-dev-selected', devPath);
    const designInfo = await logImageInfo('step1-design-selected', designPath);

    // Compress large images (by file size) before passing to step1 model
    const step1DesignPath = await createAnalysisImage(designPath, 'step1-design');
    console.log(`[uicheck step1] design path for model: ${step1DesignPath}`);

    console.log('[uicheck step1] files:', files);
    console.log('[uicheck step1] devFiles:', uicheckFlow.devFiles);
    console.log('[uicheck step1] designFiles:', uicheckFlow.designFiles);
    console.log('[uicheck step1] selected devFile:', devFile);
    console.log('[uicheck step1] selected designFile:', designFile);
    console.log('[uicheck step1] devPath:', devPath);
    console.log('[uicheck step1] designPath:', designPath);

    uicheckStep1Context = {
      latestUploadState,
      flow: uicheckFlow,
      selection,
      devFiles: uicheckFlow.devFiles,
      designFiles: uicheckFlow.designFiles,
      devFile,
      designFile,
      devPath,
      designPath,
      step1DesignPath,
      pageType,
      devInfo,
      designInfo
    };
  }

  const prompt = buildPrompt(files, type, uicheckStep1Context);
  if (type === 'uicheck') {
    const step1PromptPath = writeUICheckPromptDebugFile('step1', prompt);
    const step1ReferenceFiles = [SKILL_MD_PATH].filter(fp => fs.existsSync(fp));
    const step1BgFile = files.find(f => /background\.txt$/i.test(f));
    if (step1BgFile) step1ReferenceFiles.push(path.join(typeDir, step1BgFile));
    logUICheckRunMeta('step1', {
      flowName: uicheckStep1Context?.flow?.flowName,
      flowFunction: uicheckStep1Context?.flow?.flowFunction,
      promptFilePath: step1PromptPath,
      imageRefs: [uicheckStep1Context?.designPath].filter(Boolean).map(p => toClaudeFileRef(p)),
      referenceFiles: step1ReferenceFiles
    });
    console.log('[uicheck step1] final prompt:\n' + prompt);
    await appendUICheckRuntimeDebug({
      phase: 'step1-before-model',
      flow: uicheckStep1Context?.flow || null,
      promptFilePath: step1PromptPath,
      files,
      devFiles: uicheckStep1Context?.devFiles || [],
      designFiles: uicheckStep1Context?.designFiles || [],
      selected: {
        devFile: uicheckStep1Context?.devFile || '',
        designFile: uicheckStep1Context?.designFile || '',
        devPath: uicheckStep1Context?.devPath || '',
        designPath: uicheckStep1Context?.designPath || ''
      },
      imageInfo: {
        dev: uicheckStep1Context?.devInfo || null,
        design: uicheckStep1Context?.designInfo || null
      },
      referenceFiles: step1ReferenceFiles,
      imageRefs: [uicheckStep1Context?.designPath].filter(Boolean).map(p => toClaudeFileRef(p)),
      prompt
    });
  }

  res.write(`data: ${JSON.stringify({ type: 'status', content: 'Claude API 调用中...' })}\n\n`);

  // uicheck only keeps the single-page uicheck_pro main flow
  let finalPrompt = prompt;
  if (type === 'uicheck') {
    res.write(`data: ${JSON.stringify({ type: 'status', content: '正在分析设计稿结构...' })}\n\n`);
  }

  // uicheck step1 uses Claude API with vision model (sonnet-4.6) and @absolute-path image
  const uicheckVisionModel = visionModel;  // from query param
  const useStreamJson = type === 'uicheck';
  const outputFormat = useStreamJson ? 'stream-json' : 'text';

  // 检查是否使用自定义 API
  if (currentApiConfig && currentApiConfig.apiKey) {
    console.log('[uicheck] 使用自定义 API 配置:', currentApiConfig.provider);

    try {
      res.write(`data: ${JSON.stringify({ type: 'status', content: `正在使用 ${currentApiConfig.provider} API 调用模型...` })}\n\n`);

      // 获取图片路径
      const imagePaths = [];
      if (type === 'uicheck' && uicheckStep1Context) {
        if (uicheckStep1Context.designPath) imagePaths.push(uicheckStep1Context.designPath);
        if (uicheckStep1Context.devPath) imagePaths.push(uicheckStep1Context.devPath);
      }

      // 调用 API
      const apiResult = await callAiApiDirectly(prompt, imagePaths, currentApiConfig.model || uicheckVisionModel);

      // 返回结果
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: apiResult })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', code: 0 })}\n\n`);
      res.end();
      return;

    } catch (error) {
      console.error('[uicheck] API 调用失败:', error.message);
      res.write(`data: ${JSON.stringify({ type: 'error', content: `API 调用失败: ${error.message}` })}\n\n`);
      res.end();
      return;
    }
  }

  // 自动检测并获取 CLI 路径（Claude Code / Codex）
  const { cliPath, tool } = getCliPath();

  // 根据工具类型使用不同的参数
  let baseArgs;
  if (tool === 'claude') {
    // Claude Code CLI 参数
    baseArgs = [
      '--model', uicheckVisionModel,
      '--output-format', outputFormat,
      '--permission-mode', 'bypassPermissions',
      '--verbose',  // stream-json 需要这个参数
      '-p',  // --print 的简写，非交互模式
      prompt
    ];
  } else {
    // Codex CLI 参数（假设与 OpenAI 兼容）
    baseArgs = [
      '--model', uicheckVisionModel,
      '-q',
      '--approval-mode', 'yolo',
      '--output-format', outputFormat,
      prompt
    ];
  }

  console.log(`[uicheck] 使用 ${tool} CLI: ${cliPath}, model: ${uicheckVisionModel}`);
  console.log('[uicheck] args:', JSON.stringify(baseArgs));
  const claude = spawn(cliPath, baseArgs, {
    cwd: PARENT_DIR,
    env: { ...process.env }
  });

  // Collect full output for uicheck post-processing
  let fullRawOutput = '';  // raw stream-json or text
  let fullTextOutput = ''; // extracted text (for stream-json mode)

  // For uicheck single-page mode, hide step 1 output from frontend
  const uicheckSinglePage = type === 'uicheck';

  claude.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    fullRawOutput += text;
    if (!uicheckSinglePage && !useStreamJson) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
    }
  });

  claude.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (!useStreamJson) {
      res.write(`data: ${JSON.stringify({ type: 'stderr', content: text })}\n\n`);
    }
    console.log(`[${type} stderr]`, text.slice(0, 200));
  });

  claude.on('close', async (code) => {
    // For stream-json mode, extract the text content
    if (useStreamJson) {
      fullTextOutput = extractTextFromStreamJson(fullRawOutput);
    } else {
      fullTextOutput = fullRawOutput;
    }
    // Debug: save full output
    fs.writeFileSync(UICHECK_RUNTIME_DEBUG_PATH.replace('.json', '-output.txt'), fullTextOutput);
    fs.writeFileSync(UICHECK_RUNTIME_DEBUG_PATH.replace('.json', '-output-raw.txt'), fullRawOutput);
    console.log('[uicheck] full text output length:', fullTextOutput.length, 'raw length:', fullRawOutput.length);

    if (code !== 0) {
      const quotaErr = /quota|authenticate|403|token-plan/i.test(fullTextOutput + fullRawOutput);
      const errMsg = quotaErr
        ? 'Claude API 调用失败：鉴权异常。请检查 API 密钥配置。'
        : `Claude API 调用失败（退出码 ${code}）。请查看服务端日志和 .claude/uicheck-runtime-debug-output.txt。`;
      res.write(`data: ${JSON.stringify({ type: 'error', content: errMsg })}\n\n`);
      res.end();
      return;
    }

    // For uicheck: detect vision model quota exhaustion or GLM fallback
    if (type === 'uicheck') {
      const quotaExhausted = /额度上限|已达到使用额度|fallback to wanqing/i.test(fullRawOutput);
      if (quotaExhausted) {
        console.log('[uicheck step1] ERROR: vision model quota exhausted or fell back to GLM (no vision)');
        res.write(`data: ${JSON.stringify({ type: 'error', content: '视觉模型（claude-sonnet）额度已用完，系统 fallback 到无视觉能力的 GLM 模型，无法读图。请等待额度刷新（约12小时）后重试。' })}\n\n`);
        res.end();
        return;
      }
    }

    // For uicheck: fixed single-page main flow
    if (type === 'uicheck') {
      const designSpec = parseDesignSpecFromOutput(fullTextOutput);
      const latestUploadState = readUICheckLatestUploadState();
      const flow = resolveUICheckFlow(files, latestUploadState);
      console.log('[uicheck step1] parsed JSON:', JSON.stringify(designSpec, null, 2));
      console.log('[uicheck step1] verification text:', fullTextOutput.slice(0, 500));

      const step1Verification = ensureUICheckReadVerificationOrThrow(fullTextOutput, 'step1');
      if (!step1Verification.ok) {
        console.log('[uicheck step1] verification failed:', step1Verification.reason);
        res.write(`data: ${JSON.stringify({ type: 'error', content: '设计稿读图验证失败：' + step1Verification.reason + '。请检查上传的设计稿图片是否正确。' })}\n\n`);
        res.end();
        return;
      }

      const selection = await selectSinglePageUICheckFiles(files, typeDir, latestUploadState);
      const devFile = selection.devFile;
      const designFile = selection.designFile;
      const bgFile = files.find(f => /background\.txt$/i.test(f));
      const bgPath = bgFile ? path.join(typeDir, bgFile) : '';
      const bgContent = bgPath && fs.existsSync(bgPath)
        ? fs.readFileSync(bgPath, 'utf-8').trim().slice(0, 2000)
        : '';

      if (devFile && designFile && Array.isArray(designSpec) && designSpec.length > 0) {
        console.log('[uicheck step 2] design spec modules:', designSpec.length);
        res.write(`data: ${JSON.stringify({ type: 'status', content: '正在对比开发稿...' })}\n\n`);

        const devPath = path.join(typeDir, devFile);
        const designFilePath = path.join(typeDir, designFile);
        console.log('[uicheck step 2] files:', files);
        console.log('[uicheck step 2] devFiles:', selection.devFiles);
        console.log('[uicheck step 2] designFiles:', selection.designFiles);
        console.log('[uicheck step 2] devFile:', devFile);
        console.log('[uicheck step 2] designFile:', designFile);
        console.log('[uicheck step 2] devPath:', devPath);
        console.log('[uicheck step 2] designFilePath:', designFilePath);
        // Compress large images (by file size) before passing to step2 model
        const step2DevInfo = await logImageInfo('step2-dev-original', devPath);
        const step2DesignInfo = await logImageInfo('step2-design-original', designFilePath);
        let analysisDevPath = await createAnalysisImage(devPath, 'step2-dev');
        const analysisDesignPath = await createAnalysisImage(designFilePath, 'step2-design');
        // B端专用：将开发稿宽度对齐设计稿，减少比例差异导致的坐标估算偏差
        if (pageType === 'b') {
          analysisDevPath = await resizeDevToMatchDesign(analysisDevPath, analysisDesignPath, 'step2');
        }
        const step2AnalysisDevInfo = await logImageInfo('step2-dev-for-model', analysisDevPath);
        const step2AnalysisDesignInfo = await logImageInfo('step2-design-for-model', analysisDesignPath);
        const step2AnalysisPrompt = buildUICheckStep2AnalysisPrompt(designSpec, analysisDevPath, analysisDesignPath, bgContent, pageType);
        const step2PromptPath = writeUICheckPromptDebugFile('step2-analysis', step2AnalysisPrompt);
        const step2References = [SKILL_MD_PATH, ...loadSkillContext('analysis', pageType).map(f => f.path)].filter(fp => fs.existsSync(fp));
        logUICheckRunMeta('step2', {
          flowName: flow.flowName,
          flowFunction: flow.flowFunction,
          promptFilePath: step2PromptPath,
          imageRefs: [toClaudeFileRef(analysisDevPath), toClaudeFileRef(analysisDesignPath)],
          referenceFiles: step2References
        });
        console.log('[uicheck step2] final prompt:\n' + step2AnalysisPrompt);
        console.log('[uicheck step2] prompt image refs:', JSON.stringify([
          toClaudeFileRef(analysisDevPath),
          toClaudeFileRef(analysisDesignPath)
        ]));
        await appendUICheckRuntimeDebug({
          phase: 'step2-before-model',
          flow,
          promptFilePath: step2PromptPath,
          files,
          devFiles: selection.devFiles,
          designFiles: selection.designFiles,
          selected: {
            devFile,
            designFile,
            devPath,
            designPath: designFilePath,
            analysisDevPath,
            analysisDesignPath
          },
          imageInfo: {
            dev: step2DevInfo,
            design: step2DesignInfo,
            analysisDev: step2AnalysisDevInfo,
            analysisDesign: step2AnalysisDesignInfo
          },
          referenceFiles: step2References,
          imageRefs: [toClaudeFileRef(analysisDevPath), toClaudeFileRef(analysisDesignPath)],
          prompt: step2AnalysisPrompt,
          parsedJson: designSpec
        });

        // Phase A: issue detection only (stream-json for raw debug + final text extraction)
        // 使用自动检测的 CLI（Claude Code / Codex）
        const { cliPath: step2ClaudePath, tool: step2Tool } = getCliPath();

        let step2Args;
        if (step2Tool === 'claude') {
          // Claude Code CLI 参数
          step2Args = [
            '--model', visionModel,
            '--output-format', 'stream-json',
            '--permission-mode', 'bypassPermissions',
            '--verbose',  // stream-json 需要这个参数
            '-p',
            step2AnalysisPrompt
          ];
        } else {
          // Codex CLI 参数
          step2Args = [
            '--model', visionModel,
            '-q', '--approval-mode', 'yolo',
            '--output-format', 'stream-json',
            step2AnalysisPrompt
          ];
        }

        console.log('[uicheck step2] claude args:', JSON.stringify(step2Args));
        console.log(`[uicheck step2] 使用 ${step2Tool} CLI: ${step2ClaudePath}`);
        const claude2 = spawn(step2ClaudePath, step2Args, {
          cwd: PARENT_DIR,
          env: { ...process.env }
        });

        const STEP2_ANALYSIS_TIMEOUT_MS = 8 * 60 * 1000;
        let step2AnalysisTimedOut = false;
        const step2AnalysisTimer = setTimeout(() => {
          step2AnalysisTimedOut = true;
          console.log('[uicheck step2 analysis] timeout - killing process');
          claude2.kill('SIGTERM');
          setTimeout(() => { try { claude2.kill('SIGKILL'); } catch {} }, 3000);
        }, STEP2_ANALYSIS_TIMEOUT_MS);

        let step2StartTime = Date.now();
        const heartbeat = setInterval(() => {
          const elapsed = Math.round((Date.now() - step2StartTime) / 1000);
          res.write(`data: ${JSON.stringify({ type: 'status', content: `正在对比开发稿...（已运行 ${elapsed} 秒）` })}\n\n`);
        }, 15000);

        let step2RawLines = '';
        claude2.stdout.on('data', (chunk) => {
          step2RawLines += chunk.toString();
        });
        claude2.stderr.on('data', (chunk) => {
          console.log('[uicheck step2 analysis stderr]', chunk.toString().slice(0, 200));
        });

        claude2.on('close', async (code2) => {
          clearTimeout(step2AnalysisTimer);
          const rawOutput = step2RawLines;
          const analysisOutput = extractTextFromStreamJson(step2RawLines).trim();
          fs.writeFileSync(UICHECK_RUNTIME_DEBUG_PATH.replace('.json', '-step2-raw.txt'), rawOutput);
          fs.writeFileSync(UICHECK_RUNTIME_DEBUG_PATH.replace('.json', '-step2.txt'), analysisOutput);
          console.log('[uicheck step2 analysis] closed, code:', code2, 'output length:', analysisOutput.length);

          if (step2AnalysisTimedOut) {
            clearInterval(heartbeat);
            res.write(`data: ${JSON.stringify({ type: 'error', content: '开发稿问题识别超时（8分钟），请查看 .claude/uicheck-runtime-debug-step2.txt' })}\n\n`);
            res.end();
            return;
          }

          if (code2 !== 0) {
            clearInterval(heartbeat);
            const quotaErr2 = /quota|authenticate|403|token-plan/i.test(analysisOutput);
            const errMsg2 = quotaErr2
              ? '开发稿对比失败：Claude API 鉴权异常。请检查 API 密钥配置。'
              : `开发稿对比失败（退出码 ${code2}）。请查看服务端日志和 .claude/uicheck-runtime-debug-step2.txt`;
            res.write(`data: ${JSON.stringify({ type: 'error', content: errMsg2 })}\n\n`);
            res.end();
            return;
          }

          // Detect vision model quota exhaustion for step2
          const step2QuotaExhausted = /额度上限|已达到使用额度|fallback to wanqing/i.test(rawOutput);
          if (step2QuotaExhausted) {
            clearInterval(heartbeat);
            console.log('[uicheck step2] ERROR: vision model quota exhausted');
            res.write(`data: ${JSON.stringify({ type: 'error', content: '对比阶段视觉模型额度已用完，无法读图。请等待额度刷新（约12小时）后重试。' })}\n\n`);
            res.end();
            return;
          }

          const issueData = parseIssuesFromOutput(analysisOutput);
          console.log('[uicheck step2] parsed JSON:', JSON.stringify(issueData, null, 2));

          const verificationGate = ensureUICheckReadVerificationOrThrow(analysisOutput, 'step2');
          if (!verificationGate.ok) {
            clearInterval(heartbeat);
            console.log('[uicheck step2] verification failed:', verificationGate.reason);
            await appendUICheckRuntimeDebug({
              phase: 'step2-verification-failed',
              flow,
              verification: verificationGate.verification,
              reason: verificationGate.reason,
              rawOutput,
              analysisOutput
            });
            res.write(`data: ${JSON.stringify({ type: 'error', content: '读图验证失败：' + verificationGate.reason + '。请检查上传的开发截图和设计稿是否正确。' })}\n\n`);
            res.end();
            return;
          }

          if (!issueData) {
            clearInterval(heartbeat);
            res.write(`data: ${JSON.stringify({ type: 'error', content: '开发稿问题识别完成，但未解析到有效 JSON。请查看 .claude/uicheck-runtime-debug-step2.txt' })}\n\n`);
            res.end();
            return;
          }

          res.write(`data: ${JSON.stringify({ type: 'status', content: '正在生成问题截图...' })}\n\n`);

          // Phase B: Generate issue screenshots
          // Primary: Node.js sharp (no Python dependency)
          // Fallback: Python Pillow script if sharp fails
          try {
            await generateIssueScreenshotsWithSharp(issueData, devPath, designFilePath);
            console.log('[uicheck step2 screenshot] sharp done');
          } catch (sharpErr) {
            console.log('[uicheck step2 screenshot] sharp error:', sharpErr.message, '- falling back to Python');
            const flatIssues = flattenIssueData(issueData);
            const screenshotScript = generateScreenshotScript(flatIssues, devPath, designFilePath);
            try {
              const scriptResult = await executeScreenshotScript(screenshotScript);
              console.log('[uicheck step2 screenshot] Python fallback done:', scriptResult.stdout.trim());
            } catch (pyErr) {
              console.log('[uicheck step2 screenshot] Python fallback also failed:', pyErr.message);
              res.write(`data: ${JSON.stringify({ type: 'warning', content: '截图生成失败：sharp 和 Python/Pillow 均不可用。请运行: pip3 install Pillow' })}\n\n`);
            }
          }

          const mergedData = attachGeneratedIssueImages(issueData);
          clearInterval(heartbeat);
          const mergedJsonStr = '```json\n' + JSON.stringify(mergedData, null, 2) + '\n```';
          await appendUICheckRuntimeDebug({
            phase: 'step2-after-model',
            flow,
            parsedJson: issueData,
            mergedJson: mergedData
          });
          await generateIssueTable(mergedJsonStr, files, typeDir, false, res);
          res.write(`data: ${JSON.stringify({ type: 'done', code: 0 })}\n\n`);
          res.end();
        });
        claude2.on('error', (err) => {
          clearTimeout(step2AnalysisTimer);
          clearInterval(heartbeat);
          console.log('[uicheck step2] error:', err.message);
          res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
          res.end();
        });
        return;
      }

      console.log('[uicheck step 2] missing dev file or empty design spec');
      res.write(`data: ${JSON.stringify({ type: 'error', content: '设计稿结构解析失败，请检查设计稿是否可读，或查看 .claude/uicheck-runtime-debug-output.txt 排查 Claude API 输出。' })}\n\n`);
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify({ type: 'done', code })}\n\n`);
    res.end();
  });

  claude.on('error', (err) => {
    console.log('[uicheck] error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    res.end();
  });
});

// Fetch URL content
async function fetchUrlContent(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return null;
    const html = await response.text();
    // Strip HTML tags to get text content
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/&nbsp;/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();
    if (text.length < 500 || /^(login|登录|sign in)$/i.test(text)) return null;
    return text.substring(0, 30000);
  } catch {
    return null;
  }
}


function buildUICheckPrompt(files, type, uicheckContext = null) {
  const txtFiles = files.filter(f => /background\.txt$/i.test(f));
  const typeDir = getInputsDir(type);
  const flow = uicheckContext?.flow || resolveUICheckFlow(files, uicheckContext?.latestUploadState || null);
  const pageType = uicheckContext?.pageType || 'c';

  if (flow.mode === 'folder') {
    throw new Error('uicheck folder-mode is disabled for current requests');
  }

  // Single page mode — Step 1: analyze design ONLY, output module spec
  const designFile = files.find(f => /design_mockup/i.test(f)) || files.find(f => /^design[_-]/i.test(f)) || files.find(f => isUICheckImageFile(f));
  const designRawPath = path.resolve(path.join(typeDir, designFile));
  // Use pre-compressed path from context if available, otherwise use raw path
  const designAbsPath = uicheckContext?.step1DesignPath || designRawPath;

  const bgContent = txtFiles.length > 0
    ? readTextFileIfExists(path.resolve(path.join(typeDir, txtFiles[0]))).trim().slice(0, 2000)
    : '';

  const bHint = pageType === 'b' ? readTextFileIfExists(path.join(REF_DIR_B, 'step1_hint.md')) : '';

  let prompt = `你是一名资深 UI 设计师。分析下面这张**设计稿**图片，从上到下列出页面模块。
${bHint ? `\n${bHint}\n` : ''}
## 设计稿图片

@${designAbsPath}

## 读图验证（必须先执行）

先输出“读图验证”段落，严格包含：
1. 图片中真实可见的标题/页面名称（逐字引用）
2. 图片顶部主色、主背景色
3. 从上到下第一个主要模块名称

如果无法看到图片内容，输出“读图验证失败：[reason]” 并停止。

禁止凭想象编造内容，只输出图片中实际可见的。
JSON 字段值中禁止出现中文引号（""），只用英文双引号，如需引用含引号的文字用单引号替代。
`;
  if (bgContent) {
    prompt += `\n## 背景信息\n${bgContent}\n`;
  }
  prompt += `\n## 输出格式\n`;
  prompt += `先输出读图验证，然后输出 JSON 数组：\n`;
  prompt += `\`\`\`json\n`;
  prompt += `[\n`;
  prompt += `  {"order": 1, "name": "模块名称", "content": "模块内容概述", "visual": "视觉特征概述"},\n`;
  prompt += `  {"order": 2, "name": "模块名称", "content": "模块内容概述", "visual": "视觉特征概述"}\n`;
  prompt += `]\n`;
  prompt += `\`\`\`\n`;

  return prompt;
}


app.listen(PORT, () => {
  console.log(`设计师平台运行中: http://localhost:${PORT}/`);
});
