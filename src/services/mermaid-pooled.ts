/**
 * Mermaid Diagram Generator - 使用 Browser Pool 优化版本
 * 
 * 优势：
 * - 复用浏览器实例，避免每次渲染都启动新进程
 * - 首次渲染后，后续渲染速度提升 5-10 倍
 * - 支持并发渲染（多个 Page 并行工作）
 */

import { Page } from 'puppeteer-core';
import { browserPool } from './browser-pool';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

export type MermaidFormat = 'svg' | 'png' | 'pdf';
export type MermaidTheme = 'default' | 'forest' | 'dark' | 'neutral';

export interface GenerateOptions {
  code: string;
  format?: MermaidFormat;
  theme?: MermaidTheme;
  /** @deprecated Mermaid 图表宽度由内容自动计算，此参数暂不生效 */
  width?: number;
  /** @deprecated Mermaid 图表高度由内容自动计算，此参数暂不生效 */
  height?: number;
  backgroundColor?: string;
  /** 
   * 清晰度倍数 (1-10)，用于生成高清图片
   * - scale=1: 标准清晰度（默认）
   * - scale=2: 2倍清晰度（推荐，适合高 DPI 屏幕）
   * - scale=3: 3倍清晰度（超清）
   * - scale=4-10: 更高清晰度（用于打印等场景）
   * 
   * 注意：如果 scale 导致输出图片超过 MAX_WIDTH/MAX_HEIGHT 限制，
   * 会自动降低 scale 以确保输出不超限
   */
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

// 加载本地 mermaid.js（避免每次从 CDN 加载，提高速度和稳定性）
const MERMAID_JS_PATH = path.join(__dirname, '..', 'assets', 'mermaid.min.js');
let MERMAID_JS_CONTENT: string;

try {
  MERMAID_JS_CONTENT = fs.readFileSync(MERMAID_JS_PATH, 'utf-8');
  console.log(`[MermaidPooled] Loaded mermaid.js from ${MERMAID_JS_PATH} (${(MERMAID_JS_CONTENT.length / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error(`[MermaidPooled] Failed to load mermaid.js from ${MERMAID_JS_PATH}, falling back to CDN`);
  MERMAID_JS_CONTENT = '';
}

// CDN URL 作为 fallback
const MERMAID_CDN_URL = process.env.MERMAID_CDN_URL ?? 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

// 最大图片尺寸限制（参考 mermaid.ink 默认 10000x10000）
const MAX_WIDTH = parseInt(process.env.MAX_WIDTH ?? '10000', 10);
const MAX_HEIGHT = parseInt(process.env.MAX_HEIGHT ?? '10000', 10);

// scale 范围限制
const MIN_SCALE = 1;
const MAX_SCALE = 10;

interface MermaidHtmlOptions {
  code: string;
  theme: MermaidTheme;
  backgroundColor: string;
}

/**
 * 生成 Mermaid 图表的 HTML 页面
 * 优先使用内嵌的 mermaid.js，避免网络请求
 */
function generateMermaidHtml(options: MermaidHtmlOptions): string {
  const { code, theme, backgroundColor } = options;
  
  // 转义代码中的特殊字符
  const escapedCode = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 根据是否有本地 mermaid.js 决定加载方式
  const mermaidScript = MERMAID_JS_CONTENT
    ? `<script>${MERMAID_JS_CONTENT}</script>`
    : `<script src="${MERMAID_CDN_URL}"></script>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background-color: ${backgroundColor};
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    #container {
      max-width: 100%;
    }
    .mermaid {
      font-family: 'trebuchet ms', verdana, arial, sans-serif;
    }
  </style>
</head>
<body>
  <div id="container">
    <pre class="mermaid">${escapedCode}</pre>
  </div>
  ${mermaidScript}
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: '${theme}',
      securityLevel: 'loose',
      fontFamily: 'trebuchet ms, verdana, arial, sans-serif'
    });
  </script>
</body>
</html>
`;
}

/**
 * 使用 Browser Pool 生成 Mermaid 图表
 * 
 * 清晰度控制：
 * - scale 参数通过 Puppeteer 的 deviceScaleFactor 实现
 * - scale=2 会生成 2x 分辨率的图片（物理尺寸翻倍，清晰度更高）
 * - 重要：必须在 Mermaid 渲染之前设置 deviceScaleFactor
 * 
 * 尺寸限制：
 * - 最大输出尺寸由 MAX_WIDTH/MAX_HEIGHT 环境变量控制（默认 10000x10000）
 * - 如果 scale 导致输出超过最大尺寸，会自动降低 scale
 */
export async function generateMermaidDiagram(options: GenerateOptions): Promise<GenerateResult> {
  const {
    code,
    format = 'svg',
    theme = 'default',
    backgroundColor = 'white',
    scale = 1,
  } = options;

  // 限制 scale 范围 1-10
  const requestedScale = Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));

  const startTime = Date.now();
  let page: Page | null = null;
  
  // 创建临时 HTML 文件（因为内嵌 mermaid.js 后 data URL 太长会报错）
  const tempDir = os.tmpdir();
  const tempHtmlFile = path.join(tempDir, `mermaid-${uuidv4()}.html`);

  try {
    // 从池中获取 Page
    page = await browserPool.acquirePage();
    
    // 生成 HTML 并写入临时文件
    const html = generateMermaidHtml({ code, theme, backgroundColor });
    await fs.promises.writeFile(tempHtmlFile, html, 'utf-8');
    const fileUrl = `file://${tempHtmlFile}`;
    
    // 第一步：先用 scale=1 渲染，获取基础尺寸
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
    
    // 使用 domcontentloaded 而不是 networkidle0（无需等待网络，mermaid.js 已内嵌）
    await page.goto(fileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT,
    });

    // 等待 Mermaid 渲染完成
    await page.waitForSelector('.mermaid svg', { timeout: RENDER_TIMEOUT });

    // 获取 SVG 元素边界
    const svgElement = await page.$('.mermaid svg');
    if (!svgElement) {
      throw new Error('Failed to render Mermaid diagram: SVG element not found');
    }

    // 获取基础尺寸（scale=1 时的尺寸）
    const baseBoundingBox = await svgElement.boundingBox();
    if (!baseBoundingBox) {
      throw new Error('Failed to get SVG bounding box');
    }

    const baseWidth = Math.ceil(baseBoundingBox.width);
    const baseHeight = Math.ceil(baseBoundingBox.height);

    // 第二步：计算实际可用的 scale（基于最大尺寸限制）
    // 输出尺寸 = 基础尺寸 × scale
    // 如果 baseWidth × scale > MAX_WIDTH，需要降低 scale
    const maxScaleByWidth = Math.floor(MAX_WIDTH / baseWidth);
    const maxScaleByHeight = Math.floor(MAX_HEIGHT / baseHeight);
    const maxAllowedScale = Math.max(1, Math.min(maxScaleByWidth, maxScaleByHeight));

    // 实际使用的 scale = min(请求的 scale, 允许的最大 scale)
    const actualScale = Math.min(requestedScale, maxAllowedScale);

    // 如果实际 scale 与请求 scale 不同，记录日志
    if (actualScale !== requestedScale) {
      console.log(`[MermaidPooled] Scale adjusted: requested=${requestedScale}, actual=${actualScale} (base size: ${baseWidth}x${baseHeight}, max: ${MAX_WIDTH}x${MAX_HEIGHT})`);
    }

    // 第三步：如果需要 scale > 1，重新设置 viewport 并重新渲染
    if (actualScale > 1) {
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: actualScale,
      });

      // 重新加载页面以应用新的 deviceScaleFactor
      await page.goto(fileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: RENDER_TIMEOUT,
      });

      await page.waitForSelector('.mermaid svg', { timeout: RENDER_TIMEOUT });
    }

    // 重新获取 SVG 元素（可能因为重新渲染而改变）
    const finalSvgElement = await page.$('.mermaid svg');
    if (!finalSvgElement) {
      throw new Error('Failed to render Mermaid diagram: SVG element not found after scale adjustment');
    }

    let data: Buffer;
    let contentType: string;

    if (format === 'svg') {
      // 获取 SVG 内容
      const svgContent = await page.evaluate((): string | null => {
        const svg = document.querySelector('.mermaid svg');
        if (!svg) return null;
        return svg.outerHTML;
      });
      
      if (!svgContent) {
        throw new Error('Failed to extract SVG content');
      }
      
      data = Buffer.from(svgContent, 'utf-8');
      contentType = 'image/svg+xml';
    } else if (format === 'pdf') {
      // PDF: 使用 page.pdf() 生成
      const boundingBox = await finalSvgElement.boundingBox();
      
      if (!boundingBox) {
        throw new Error('Failed to get SVG bounding box');
      }

      const viewportWidth = Math.ceil(boundingBox.width) + 40;
      const viewportHeight = Math.ceil(boundingBox.height) + 40;
      
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: actualScale,
      });

      // 生成 PDF
      data = await page.pdf({
        width: viewportWidth,
        height: viewportHeight,
        printBackground: true,
        pageRanges: '1',
      }) as Buffer;
      
      contentType = 'application/pdf';
    } else {
      // PNG: deviceScaleFactor 已在页面加载前设置
      // 直接对 SVG 元素截图，截图会自动应用 deviceScaleFactor
      data = await finalSvgElement.screenshot({
        type: 'png',
        omitBackground: backgroundColor === 'transparent',
      }) as Buffer;
      
      contentType = 'image/png';
    }

    const duration = Date.now() - startTime;
    console.log(`[MermaidPooled] Rendered ${format} (scale=${actualScale}, base=${baseWidth}x${baseHeight}) in ${duration}ms`);

    return { data, contentType };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[MermaidPooled] Failed after ${duration}ms:`, error);
    throw error;
  } finally {
    // 清理临时文件
    try {
      await fs.promises.unlink(tempHtmlFile);
    } catch {
      // Ignore cleanup errors
    }
    
    // 释放 Page 回池
    if (page) {
      try {
        // 清理页面状态（准备复用）
        await page.evaluate((): void => {
          document.body.innerHTML = '';
        });
      } catch {
        // Ignore cleanup errors
      }
      browserPool.releasePage(page);
    }
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
