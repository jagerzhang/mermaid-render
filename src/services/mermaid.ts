import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Browser Pool 优化版本（可选启用）
import * as mermaidPooled from './mermaid-pooled';

const execAsync = promisify(exec);

export type MermaidFormat = 'svg' | 'png' | 'pdf';
export type MermaidTheme = 'default' | 'forest' | 'dark' | 'neutral';

export interface GenerateOptions {
  code: string;
  format?: MermaidFormat;
  theme?: MermaidTheme;
  width?: number;
  height?: number;
  backgroundColor?: string;
  /** 缩放倍数（1-3），用于提高清晰度。默认 1，推荐 2 获得高清图片 */
  scale?: number;
}

export interface GenerateResult {
  data: Buffer;
  contentType: string;
}

export const VALID_FORMATS: MermaidFormat[] = ['svg', 'png', 'pdf'];
export const VALID_THEMES: MermaidTheme[] = ['default', 'forest', 'dark', 'neutral'];

// Timeout for rendering (30 seconds)
const RENDER_TIMEOUT = parseInt(process.env.RENDER_TIMEOUT ?? '30000', 10);

// 是否使用 Browser Pool 模式（默认启用，可通过环境变量关闭）
// Browser Pool 模式包含更多优化和修复（FontAwesome 图标、边距优化等）
const USE_BROWSER_POOL = process.env.USE_BROWSER_POOL !== 'false';

/**
 * Generate a Mermaid diagram
 * 
 * 支持两种模式：
 * 1. Browser Pool 模式（默认）：复用常驻的 Chromium 实例，性能更好
 *    - 包含 FontAwesome 图标支持
 *    - 包含边距优化（更紧凑的输出）
 *    - 包含 SVG 尺寸修正
 * 2. CLI 模式：每次调用 mmdc CLI，启动新的 Chromium 进程
 *    - 功能较基础，无自定义优化
 * 
 * 通过环境变量 USE_BROWSER_POOL=false 切换到 CLI 模式
 */
export async function generateMermaidDiagram(options: GenerateOptions): Promise<GenerateResult> {
  // 如果启用了 Browser Pool 模式（默认），使用优化版本
  if (USE_BROWSER_POOL) {
    console.log('[Mermaid] Using Browser Pool mode (optimized)');
    return mermaidPooled.generateMermaidDiagram(options);
  }
  
  console.log('[Mermaid] Using CLI mode (basic)');
  return generateMermaidDiagramCLI(options);
}

/**
 * Generate a Mermaid diagram using mermaid-cli (mmdc)
 * 原始实现，每次启动新的 Chromium 进程
 */
async function generateMermaidDiagramCLI(options: GenerateOptions): Promise<GenerateResult> {
  const {
    code,
    format = 'svg',
    theme = 'default',
    width,
    height,
    backgroundColor = 'white',
    scale = 1,
  } = options;

  // Create temporary directory for this render
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mermaid-'));
  const inputFile = path.join(tempDir, 'input.mmd');
  const outputFile = path.join(tempDir, `output.${format}`);
  const configFile = path.join(tempDir, 'config.json');
  const puppeteerConfigFile = path.join(tempDir, 'puppeteer-config.json');
  // 每个渲染任务使用独立的 Chromium 用户目录，避免 SingletonLock 冲突
  const chromiumUserDataDir = path.join(tempDir, 'chromium-data');

  try {
    // Write input file
    await fs.promises.writeFile(inputFile, code, 'utf-8');

    // Create config file for mermaid-cli
    const config: Record<string, unknown> = {
      theme,
    };
    
    if (backgroundColor) {
      config.backgroundColor = backgroundColor;
    }

    await fs.promises.writeFile(configFile, JSON.stringify(config), 'utf-8');

    // Create puppeteer config for Docker/K8S environment
    // This is critical for running Chromium inside containers
    // ⚠️ 每个渲染任务使用独立的 userDataDir，避免并发时 SingletonLock 冲突
    const puppeteerConfig = {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      // 使用任务独立的目录，避免并发冲突
      userDataDir: chromiumUserDataDir,
      // headless 模式
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // 关键：使用 /tmp 而不是 /dev/shm
        '--disable-gpu',
        '--disable-software-rasterizer',
        // ⚠️ 不要使用 --single-process，在 Alpine 上会导致崩溃
        // ⚠️ 不要使用 --no-zygote，与 --single-process 组合不稳定
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        // 禁用不必要的功能，加速启动
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--force-color-profile=srgb',
        // 使用任务独立的临时目录
        `--user-data-dir=${chromiumUserDataDir}`,
        `--disk-cache-dir=${chromiumUserDataDir}/cache`,
      ],
    };
    await fs.promises.writeFile(puppeteerConfigFile, JSON.stringify(puppeteerConfig), 'utf-8');

    // Build mmdc command
    const mmdcPath = path.join(process.cwd(), 'node_modules', '.bin', 'mmdc');
    let command = `"${mmdcPath}" -i "${inputFile}" -o "${outputFile}" -c "${configFile}" -p "${puppeteerConfigFile}"`;

    if (width) {
      command += ` -w ${width}`;
    }
    if (height) {
      command += ` -H ${height}`;
    }
    // scale 参数控制输出图片的缩放倍数，用于提高清晰度
    if (scale && scale > 1) {
      command += ` -s ${Math.min(scale, 3)}`; // mmdc 的 -s 参数
    }

    // Execute mmdc with timeout
    await execWithTimeout(command, RENDER_TIMEOUT);

    // Read output file
    const data = await fs.promises.readFile(outputFile);
    const contentType = getContentType(format);

    return { data, contentType };
  } finally {
    // Cleanup temporary files
    await cleanupTempDir(tempDir);
  }
}

/**
 * Get content type for format
 */
function getContentType(format: MermaidFormat): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'pdf':
      return 'application/pdf';
    case 'svg':
    default:
      return 'image/svg+xml';
  }
}

/**
 * Execute a command with timeout
 */
async function execWithTimeout(command: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const childProcess = exec(command, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          console.error(`[Render] Timeout after ${duration}ms, command killed`);
          reject(new RenderTimeoutError(`Rendering timed out after ${timeout / 1000} seconds`));
        } else {
          console.error(`[Render] Failed after ${duration}ms:`, error.message);
          console.error(`[Render] stderr:`, stderr);
          reject(new RenderError(`Mermaid rendering failed: ${error.message}\n${stderr}`));
        }
        return;
      }
      
      console.log(`[Render] Success in ${duration}ms`);
      resolve({ stdout, stderr });
    });

    // Ensure process is killed on timeout
    const timeoutId = setTimeout(() => {
      console.warn(`[Render] Killing process after ${timeout}ms timeout`);
      childProcess.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (!childProcess.killed) {
          console.warn('[Render] Force killing with SIGKILL');
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    childProcess.on('exit', () => {
      clearTimeout(timeoutId);
    });
  });
}

/**
 * Clean up temporary directory (recursive)
 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Custom error for render failures
 */
export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderError';
  }
}

/**
 * Custom error for render timeouts
 */
export class RenderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderTimeoutError';
  }
}
