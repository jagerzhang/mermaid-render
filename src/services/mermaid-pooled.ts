/**
 * Mermaid Diagram Generator - 使用 Browser Pool 优化版本
 * 
 * 优势：
 * - 复用浏览器实例，避免每次渲染都启动新进程
 * - 首次渲染后，后续渲染速度提升 5-10 倍
 * - 支持并发渲染（多个 Page 并行工作）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Page } from 'puppeteer-core';
import { browserPool } from './browser-pool';

export type MermaidFormat = 'svg' | 'png' | 'pdf';
export type MermaidTheme = 'default' | 'forest' | 'dark' | 'neutral';

export interface GenerateOptions {
  code: string;
  format?: MermaidFormat;
  theme?: MermaidTheme;
  width?: number;
  height?: number;
  backgroundColor?: string;
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

/**
 * 生成 Mermaid 图表的 HTML 页面
 */
function generateMermaidHtml(code: string, theme: MermaidTheme, backgroundColor: string): string {
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
 */
export async function generateMermaidDiagram(options: GenerateOptions): Promise<GenerateResult> {
  const {
    code,
    format = 'svg',
    theme = 'default',
    width,
    height,
    backgroundColor = 'white',
  } = options;

  const startTime = Date.now();
  let page: Page | null = null;

  try {
    // 从池中获取 Page
    page = await browserPool.acquirePage();
    
    // 生成 HTML 并加载
    const html = generateMermaidHtml(code, theme, backgroundColor);
    
    // 使用 data URL 加载 HTML（避免写文件）
    // 注意：如果 HTML 太大可能需要写入临时文件
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // 设置视口大小
      const viewportWidth = width ?? Math.ceil(boundingBox.width) + 40;
      const viewportHeight = height ?? Math.ceil(boundingBox.height) + 40;
      
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
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
      // PNG: 截取 SVG 元素
      const boundingBox = await svgElement.boundingBox();
      
      if (!boundingBox) {
        throw new Error('Failed to get SVG bounding box');
      }

      // 设置视口大小
      const viewportWidth = width ?? Math.ceil(boundingBox.width) + 40;
      const viewportHeight = height ?? Math.ceil(boundingBox.height) + 40;
      
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 2, // 2x 分辨率
      });

      // 截图
      data = await svgElement.screenshot({
        type: 'png',
        omitBackground: backgroundColor === 'transparent',
      }) as Buffer;
      
      contentType = 'image/png';
    }

    const duration = Date.now() - startTime;
    console.log(`[MermaidPooled] Rendered ${format} in ${duration}ms`);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
