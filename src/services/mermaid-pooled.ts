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

// Mermaid.js 加载策略：指定了 CDN URL 则用 CDN，否则用本地文件
const MERMAID_CDN_URL = process.env.MERMAID_CDN_URL;
const MERMAID_JS_PATH = path.join(__dirname, '..', 'assets', 'mermaid.min.js');
let MERMAID_JS_CONTENT = '';

if (MERMAID_CDN_URL) {
  console.log(`[MermaidPooled] Using CDN for mermaid.js: ${MERMAID_CDN_URL}`);
} else {
  try {
    MERMAID_JS_CONTENT = fs.readFileSync(MERMAID_JS_PATH, 'utf-8');
    console.log(`[MermaidPooled] Loaded mermaid.js from ${MERMAID_JS_PATH} (${(MERMAID_JS_CONTENT.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`[MermaidPooled] Failed to load mermaid.js from ${MERMAID_JS_PATH}, please set MERMAID_CDN_URL or ensure the file exists`);
  }
}

// Font Awesome JS 加载策略：指定了 CDN URL 则用 CDN，否则用本地文件
// 注意：使用 JS 版本（SVG+JS）而不是 CSS 版本，因为 CSS 版本需要加载字体文件
const FONT_AWESOME_JS_URL = process.env.FONT_AWESOME_JS_URL;
const FONT_AWESOME_JS_PATH = path.join(__dirname, '..', 'assets', 'fontawesome.min.js');
let FONT_AWESOME_JS_CONTENT = '';

if (FONT_AWESOME_JS_URL) {
  console.log(`[MermaidPooled] Using CDN for fontawesome.js: ${FONT_AWESOME_JS_URL}`);
} else {
  try {
    FONT_AWESOME_JS_CONTENT = fs.readFileSync(FONT_AWESOME_JS_PATH, 'utf-8');
    console.log(`[MermaidPooled] Loaded fontawesome.js from ${FONT_AWESOME_JS_PATH} (${(FONT_AWESOME_JS_CONTENT.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`[MermaidPooled] Failed to load fontawesome.js from ${FONT_AWESOME_JS_PATH}, please set FONT_AWESOME_JS_URL or ensure the file exists`);
  }
}

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
 * 加载策略：指定了 CDN URL 则用 CDN，否则用本地内嵌文件
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

  // Mermaid.js 加载：指定了 CDN 用 CDN，否则用本地内嵌
  const mermaidScript = MERMAID_CDN_URL
    ? `<script src="${MERMAID_CDN_URL}"></script>`
    : `<script>${MERMAID_JS_CONTENT}</script>`;

  // Font Awesome JS 加载：指定了 CDN 用 CDN，否则用本地内嵌
  // 使用 JS 版本可以将图标渲染为内联 SVG，不依赖字体文件
  const fontAwesomeScript = FONT_AWESOME_JS_URL
    ? `<script src="${FONT_AWESOME_JS_URL}"></script>`
    : `<script>${FONT_AWESOME_JS_CONTENT}</script>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${fontAwesomeScript}
  <style>
    body {
      margin: 0;
      padding: 8px;
      background-color: ${backgroundColor};
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    #container {
      max-width: 100%;
    }
    .mermaid {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    /* 确保 foreignObject 内容不被截断 */
    .mermaid foreignObject {
      overflow: visible !important;
    }
    .mermaid foreignObject > div {
      overflow: visible !important;
      white-space: nowrap !important;
    }
    /* Font Awesome 图标样式修复 */
    .mermaid .svg-inline--fa {
      display: inline-block;
      vertical-align: -0.125em;
      overflow: visible;
      /* 确保图标没有背景 */
      background: transparent !important;
    }
    .mermaid .svg-inline--fa path {
      /* 继承父元素颜色 */
      fill: currentColor;
    }
    /* 确保 nodeLabel 中的图标正确对齐 */
    .mermaid .nodeLabel {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
    }
    /* 边缘标签样式修复 - 使用与页面一致的背景色 */
    .mermaid .edgeLabel {
      background-color: ${backgroundColor} !important;
    }
    .mermaid .edgeLabel rect {
      fill: ${backgroundColor} !important;
      background-color: ${backgroundColor} !important;
    }
    .mermaid .edgeLabel .svg-inline--fa {
      margin: 0 2px;
      background: transparent !important;
    }
    /* edgeLabel span 透明背景 */
    .mermaid .edgeLabel span {
      background-color: transparent !important;
    }
    .mermaid .labelBkg {
      background-color: ${backgroundColor} !important;
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
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif',
      flowchart: {
        htmlLabels: true,
        useMaxWidth: false
      }
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

    // 等待 Font Awesome 图标转换完成（FA JS 会将 <i> 标签转换为 <svg>）
    // FA JS 使用 MutationObserver，需要一点时间处理
    await page.waitForFunction(
      (): boolean => {
        // 检查是否有未转换的 fa 图标（i 标签还存在）
        const unconvertedIcons = document.querySelectorAll('.mermaid svg i[class*="fa-"]');
        // 如果没有 fa 相关的 i 标签，或者已经有转换后的 svg-inline--fa，认为转换完成
        return unconvertedIcons.length === 0;
      },
      { timeout: 5000 }
    ).catch(() => {
      // 超时不是错误，可能没有 FA 图标
    });
    
    // 额外等待 100ms 确保渲染稳定
    await new Promise(resolve => setTimeout(resolve, 100));

    // 定义 SVG 尺寸修正函数（需要在浏览器上下文中执行）
    const fixSvgSizeScript = `
      (() => {
        const svg = document.querySelector('.mermaid svg');
        if (!svg) return;
        
        // 首先，移除所有可能导致内容截断的 CSS 限制，并修复 FA 图标样式
        let fixStyle = document.getElementById('svg-fix-style');
        if (!fixStyle) {
          fixStyle = document.createElement('style');
          fixStyle.id = 'svg-fix-style';
          fixStyle.textContent = \`
            .mermaid foreignObject { overflow: visible !important; }
            .mermaid foreignObject > div { overflow: visible !important; white-space: nowrap !important; }
            .mermaid .nodeLabel { display: inline-flex !important; align-items: center !important; gap: 4px !important; }
            /* Font Awesome 图标样式修复 */
            .mermaid .svg-inline--fa { 
              display: inline-block !important; 
              vertical-align: -0.125em !important;
              overflow: visible !important;
              background: transparent !important;
            }
            .mermaid .svg-inline--fa path { fill: currentColor !important; }
            .mermaid .edgeLabel .svg-inline--fa { margin: 0 2px !important; }
          \`;
          document.head.appendChild(fixStyle);
        }
        
        // 修复 Font Awesome 图标：移除可能导致背景问题的样式
        const faIcons = svg.querySelectorAll('.svg-inline--fa');
        faIcons.forEach((icon) => {
          // 确保图标透明背景
          icon.style.background = 'transparent';
          icon.style.backgroundColor = 'transparent';
          // 确保图标有正确的尺寸
          if (!icon.hasAttribute('width')) {
            icon.setAttribute('width', '1em');
          }
          if (!icon.hasAttribute('height')) {
            icon.setAttribute('height', '1em');
          }
          // 修复 path 的填充色
          const paths = icon.querySelectorAll('path');
          paths.forEach((path) => {
            // 如果 path 有内联 fill 样式，检查是否正确
            const fill = path.style.fill || path.getAttribute('fill');
            if (!fill || fill === 'currentColor') {
              // 使用父元素的颜色
              path.style.fill = '#333';
            }
          });
        });
        
        // 强制布局重排
        svg.getBoundingClientRect();
        
        // 遍历所有节点组，检查内容是否溢出
        const nodeGroups = svg.querySelectorAll('g.node');
        let maxWidthIncrease = 0;
        let maxLeftExpand = 0;  // 记录向左扩展的最大距离
        
        nodeGroups.forEach((nodeGroup) => {
          const foreignObject = nodeGroup.querySelector('foreignObject');
          const labelContainer = nodeGroup.querySelector('rect.label-container');
          
          if (foreignObject && labelContainer) {
            const innerSpan = foreignObject.querySelector('span.nodeLabel');
            
            if (innerSpan) {
              // 使用 getBoundingClientRect 获取 span 渲染后的实际宽度
              const spanRect = innerSpan.getBoundingClientRect();
              const actualWidth = spanRect.width;
              
              const currentFOWidth = parseFloat(foreignObject.getAttribute('width') || '0');
              
              // 增加额外 padding
              const extraPadding = 24;
              const requiredWidth = actualWidth + extraPadding;
              
              if (requiredWidth > currentFOWidth) {
                const widthDiff = requiredWidth - currentFOWidth;
                maxWidthIncrease = Math.max(maxWidthIncrease, widthDiff);
                
                // 向左扩展的距离是宽度增量的一半
                maxLeftExpand = Math.max(maxLeftExpand, widthDiff / 2);
                
                // 更新 foreignObject 宽度
                foreignObject.setAttribute('width', String(requiredWidth));
                
                // 更新节点矩形框的宽度
                const currentRectWidth = parseFloat(labelContainer.getAttribute('width') || '0');
                const newRectWidth = currentRectWidth + widthDiff;
                labelContainer.setAttribute('width', String(newRectWidth));
                
                // 调整矩形框的 x 位置（保持居中）
                const currentRectX = parseFloat(labelContainer.getAttribute('x') || '0');
                labelContainer.setAttribute('x', String(currentRectX - widthDiff / 2));
                
                // 调整 label group 的位置
                const labelGroup = nodeGroup.querySelector('g.label');
                if (labelGroup) {
                  const transform = labelGroup.getAttribute('transform') || '';
                  const translateMatch = transform.match(/translate\\(([\\d.-]+),\\s*([\\d.-]+)\\)/);
                  if (translateMatch) {
                    const x = parseFloat(translateMatch[1]) - widthDiff / 2;
                    const y = parseFloat(translateMatch[2]);
                    labelGroup.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
                  }
                }
              }
            }
          }
        });
        
        // 更新 SVG 的 viewBox - 需要同时向左和向右扩展
        if (maxWidthIncrease > 0) {
          const currentViewBox = svg.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 0, 0];
          const [vbX, vbY, vbWidth, vbHeight] = currentViewBox;
          
          const padding = 24;
          // 向左扩展：viewBox 的 x 要减小
          const newVbX = vbX - maxLeftExpand - padding / 2;
          // 总宽度增加：左边扩展 + 右边扩展 + padding
          const newWidth = vbWidth + maxWidthIncrease + padding;
          
          svg.setAttribute('viewBox', newVbX + ' ' + vbY + ' ' + newWidth + ' ' + vbHeight);
          svg.setAttribute('width', String(newWidth));
          svg.setAttribute('height', String(vbHeight));
          svg.removeAttribute('style');
        }
      })();
    `;
    
    // 首次修正 SVG 尺寸（在获取基础尺寸之前）
    await page.evaluate(fixSvgSizeScript);

    // 获取 SVG 元素边界
    const svgElement = await page.$('.mermaid svg');
    if (!svgElement) {
      throw new Error('Failed to render Mermaid diagram: SVG element not found');
    }

    // 获取基础尺寸（修正后的尺寸）
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
      
      // 等待 Font Awesome 再次转换完成
      await page.waitForFunction(
        (): boolean => {
          const unconvertedIcons = document.querySelectorAll('.mermaid svg i[class*="fa-"]');
          return unconvertedIcons.length === 0;
        },
        { timeout: 5000 }
      ).catch(() => {});
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 重新应用尺寸修正
      await page.evaluate(fixSvgSizeScript);
    }

    // 重新获取 SVG 元素（尺寸可能已修改）
    const finalSvgElement = await page.$('.mermaid svg');
    if (!finalSvgElement) {
      throw new Error('Failed to render Mermaid diagram: SVG element not found after size adjustment');
    }

    let data: Buffer;
    let contentType: string;

    if (format === 'svg') {
      // SVG 提取并修复问题
      const debugInfo = await page.evaluate((): { found: boolean; viewBox: string | null; widthBefore: string | null; widthAfter: string | null; bbox: { x: number; y: number; width: number; height: number } | null; html: string } => {
        let svg = document.querySelector('.mermaid svg') as SVGSVGElement | null;
        if (!svg) {
          svg = document.querySelector('#container svg') as SVGSVGElement | null;
        }
        if (!svg) {
          svg = document.querySelector('svg') as SVGSVGElement | null;
        }
        if (!svg) {
          return { found: false, viewBox: null, widthBefore: null, widthAfter: null, bbox: null, html: '' };
        }
        
        const viewBox = svg.getAttribute('viewBox');
        const widthBefore = svg.getAttribute('width');
        
        // 克隆并修改
        const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
        
        // 修复 Font Awesome 图标
        const faIcons = clonedSvg.querySelectorAll('svg.svg-inline--fa');
        faIcons.forEach((icon) => {
          if (!icon.hasAttribute('width')) {
            icon.setAttribute('width', '1em');
          }
          if (!icon.hasAttribute('height')) {
            icon.setAttribute('height', '1em');
          }
          (icon as SVGElement).style.verticalAlign = '-0.125em';
          const paths = icon.querySelectorAll('path');
          paths.forEach((path) => {
            (path as SVGPathElement).style.fill = '#333';
          });
        });
        
        // 获取 SVG 内容的实际边界框（BBox）
        // 这是所有图形元素的边界，不受 viewBox 影响
        let contentBBox: { x: number; y: number; width: number; height: number } | null = null;
        try {
          const bbox = svg.getBBox();
          contentBBox = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
        } catch {
          contentBBox = null;
        }
        
        // 使用统一的边距使内容居中
        const padding = 8;  // 固定边距
        
        if (contentBBox) {
          // 基于实际内容边界计算新的 viewBox
          // 新 viewBox 从 (内容左边界 - padding) 开始
          const newX = contentBBox.x - padding;
          const newY = contentBBox.y - padding;
          const newWidth = contentBBox.width + padding * 2;
          const newHeight = contentBBox.height + padding * 2;
          
          clonedSvg.setAttribute('viewBox', `${newX} ${newY} ${newWidth} ${newHeight}`);
          clonedSvg.setAttribute('width', String(newWidth));
          clonedSvg.setAttribute('height', String(newHeight));
          clonedSvg.removeAttribute('style');
        } else if (viewBox) {
          // 降级处理：使用原始 viewBox
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3])) {
            clonedSvg.setAttribute('width', String(parts[2]));
            clonedSvg.setAttribute('height', String(parts[3]));
            clonedSvg.removeAttribute('style');
          }
        }
        
        const widthAfter = clonedSvg.getAttribute('width');
        
        return {
          found: true,
          viewBox,
          widthBefore,
          widthAfter,
          bbox: contentBBox,
          html: clonedSvg.outerHTML
        };
      });
      
      console.log('[DEBUG SVG] found:', debugInfo.found);
      console.log('[DEBUG SVG] viewBox:', debugInfo.viewBox);
      console.log('[DEBUG SVG] bbox:', JSON.stringify(debugInfo.bbox));
      console.log('[DEBUG SVG] widthBefore:', debugInfo.widthBefore);
      console.log('[DEBUG SVG] widthAfter:', debugInfo.widthAfter);
      console.log('[DEBUG SVG] html starts with:', debugInfo.html.substring(0, 250));
      
      if (!debugInfo.found || !debugInfo.html) {
        throw new Error('Failed to extract SVG content');
      }
      
      data = Buffer.from(debugInfo.html, 'utf-8');
      contentType = 'image/svg+xml';
    } else if (format === 'pdf') {
      // PDF: 使用 page.pdf() 生成
      // 需要先获取 SVG 的 boundingBox，然后截取对应区域
      const boundingBox = await finalSvgElement.boundingBox();
      
      if (!boundingBox) {
        throw new Error('Failed to get SVG bounding box');
      }

      // PDF 使用固定的对称边距
      const pdfPadding = 20;
      const contentWidth = Math.ceil(boundingBox.width);
      const contentHeight = Math.ceil(boundingBox.height);
      const pdfWidth = contentWidth + pdfPadding * 2;
      const pdfHeight = contentHeight + pdfPadding * 2;
      
      // 设置 viewport 为 PDF 尺寸
      await page.setViewport({
        width: pdfWidth,
        height: pdfHeight,
        deviceScaleFactor: actualScale,
      });
      
      // 调整页面样式使 SVG 居中且边距对称
      await page.evaluate((params: { padding: number; contentWidth: number; contentHeight: number }): void => {
        const { padding, contentWidth, contentHeight } = params;
        
        // 重置 body 样式
        const body = document.body;
        body.style.cssText = `
          margin: 0;
          padding: ${padding}px;
          width: ${contentWidth + padding * 2}px;
          height: ${contentHeight + padding * 2}px;
          display: flex;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          overflow: hidden;
        `;
        
        // 调整容器样式
        const container = document.getElementById('container');
        if (container) {
          container.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0;
            padding: 0;
          `;
        }
        
        // 确保 SVG 不被拉伸
        const svg = document.querySelector('.mermaid svg') as SVGSVGElement | null;
        if (svg) {
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '100%';
        }
      }, { padding: pdfPadding, contentWidth, contentHeight });

      // 生成 PDF
      data = await page.pdf({
        width: pdfWidth,
        height: pdfHeight,
        printBackground: true,
        pageRanges: '1',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }) as Buffer;
      
      contentType = 'application/pdf';
    } else {
      // PNG: 先优化 SVG viewBox 使边距更紧凑，然后截图
      // 获取内容的实际边界并调整 viewBox
      await page.evaluate((): void => {
        const svg = document.querySelector('.mermaid svg') as SVGSVGElement | null;
        if (!svg) return;
        
        try {
          const bbox = svg.getBBox();
          const padding = 8;  // 紧凑的边距
          
          // 基于实际内容边界计算新的 viewBox
          const newX = bbox.x - padding;
          const newY = bbox.y - padding;
          const newWidth = bbox.width + padding * 2;
          const newHeight = bbox.height + padding * 2;
          
          svg.setAttribute('viewBox', `${newX} ${newY} ${newWidth} ${newHeight}`);
          svg.setAttribute('width', String(newWidth));
          svg.setAttribute('height', String(newHeight));
          svg.removeAttribute('style');
        } catch {
          // 忽略 getBBox 错误
        }
      });
      
      // 重新获取优化后的 SVG 元素
      const optimizedSvgElement = await page.$('.mermaid svg');
      const targetElement = optimizedSvgElement || finalSvgElement;
      
      // deviceScaleFactor 已在页面加载前设置
      // 直接对 SVG 元素截图，截图会自动应用 deviceScaleFactor
      data = await targetElement.screenshot({
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
