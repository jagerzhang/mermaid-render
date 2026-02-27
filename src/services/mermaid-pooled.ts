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
   * 清晰度倍数 (1-3)，用于生成高清图片
   * - scale=1: 标准清晰度（默认）
   * - scale=2: 2倍清晰度（推荐，适合高 DPI 屏幕）
   * - scale=3: 3倍清晰度（超清）
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

// Mermaid CDN URL（使用 CDN 加载 mermaid.js）
const MERMAID_CDN_URL = process.env.MERMAID_CDN_URL ?? 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

interface MermaidHtmlOptions {
  code: string;
  theme: MermaidTheme;
  backgroundColor: string;
}

/**
 * 生成 Mermaid 图表的 HTML 页面
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
  <script src="${MERMAID_CDN_URL}"></script>
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
 */
export async function generateMermaidDiagram(options: GenerateOptions): Promise<GenerateResult> {
  const {
    code,
    format = 'svg',
    theme = 'default',
    backgroundColor = 'white',
    scale = 1,
  } = options;

  // 限制 scale 范围 1-3
  const deviceScale = Math.max(1, Math.min(scale, 3));

  const startTime = Date.now();
  let page: Page | null = null;

  try {
    // 从池中获取 Page
    page = await browserPool.acquirePage();
    
    // 关键：在加载页面之前设置 viewport 和 deviceScaleFactor
    // 这样 Mermaid 渲染时就会使用正确的设备像素比
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: deviceScale,
    });
    
    // 生成 HTML 并加载
    const html = generateMermaidHtml({ code, theme, backgroundColor });
    
    // 使用 data URL 加载 HTML（避免写文件）
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    
    await page.goto(dataUrl, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT,
    });

    // 等待 Mermaid 渲染完成
    await page.waitForSelector('.mermaid svg', { timeout: RENDER_TIMEOUT });

    // 获取 SVG 元素边界
    const svgElement = await page.$('.mermaid svg');
    if (!svgElement) {
      throw new Error('Failed to render Mermaid diagram: SVG element not found');
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
      const boundingBox = await svgElement.boundingBox();
      
      if (!boundingBox) {
        throw new Error('Failed to get SVG bounding box');
      }

      const viewportWidth = Math.ceil(boundingBox.width) + 40;
      const viewportHeight = Math.ceil(boundingBox.height) + 40;
      
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: deviceScale,
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
      data = await svgElement.screenshot({
        type: 'png',
        omitBackground: backgroundColor === 'transparent',
      }) as Buffer;
      
      contentType = 'image/png';
    }

    const duration = Date.now() - startTime;
    console.log(`[MermaidPooled] Rendered ${format} (scale=${deviceScale}) in ${duration}ms`);

    return { data, contentType };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[MermaidPooled] Failed after ${duration}ms:`, error);
    throw error;
  } finally {
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
