/**
 * Browser Pool - 浏览器实例池
 * 
 * 优化策略：
 * 1. 维护一个常驻的 Chromium 浏览器实例
 * 2. 复用浏览器，只创建新的 Page 进行渲染
 * 3. 支持并发请求（多个 Page 可以并行工作）
 * 4. 自动健康检查和重启
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';

export interface BrowserPoolOptions {
  /** 最大并发页面数 */
  maxPages?: number;
  /** 浏览器启动超时（毫秒） */
  launchTimeout?: number;
  /** 页面空闲超时后关闭（毫秒） */
  pageIdleTimeout?: number;
  /** 浏览器健康检查间隔（毫秒） */
  healthCheckInterval?: number;
  /** Chromium 可执行文件路径 */
  executablePath?: string;
}

interface PooledPage {
  page: Page;
  inUse: boolean;
  lastUsed: number;
}

class BrowserPool {
  private browser: Browser | null = null;
  private pages: PooledPage[] = [];
  private launching: Promise<Browser> | null = null;
  private options: Required<BrowserPoolOptions>;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(options: BrowserPoolOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? 4,
      launchTimeout: options.launchTimeout ?? 30000,
      pageIdleTimeout: options.pageIdleTimeout ?? 60000,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
      executablePath: options.executablePath ?? process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
    };
  }

  /**
   * 获取浏览器实例（懒加载，单例）
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // 防止并发启动多个浏览器
    if (this.launching) {
      return this.launching;
    }

    this.launching = this.launchBrowser();
    
    try {
      this.browser = await this.launching;
      this.startHealthCheck();
      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  /**
   * 启动浏览器
   */
  private async launchBrowser(): Promise<Browser> {
    console.log('[BrowserPool] Launching browser...');
    const startTime = Date.now();

    const browser = await puppeteer.launch({
      executablePath: this.options.executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
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
      ],
      timeout: this.options.launchTimeout,
    });

    const duration = Date.now() - startTime;
    console.log(`[BrowserPool] Browser launched in ${duration}ms`);

    // 监听断开事件
    browser.on('disconnected', () => {
      console.warn('[BrowserPool] Browser disconnected');
      this.browser = null;
      this.pages = [];
    });

    return browser;
  }

  /**
   * 获取一个可用的 Page（从池中获取或创建新的）
   */
  async acquirePage(): Promise<Page> {
    if (this.isShuttingDown) {
      throw new Error('Browser pool is shutting down');
    }

    const browser = await this.getBrowser();

    // 尝试获取空闲的 Page
    for (const pooled of this.pages) {
      if (!pooled.inUse) {
        pooled.inUse = true;
        pooled.lastUsed = Date.now();
        console.log(`[BrowserPool] Reusing page, active: ${this.getActiveCount()}/${this.pages.length}`);
        return pooled.page;
      }
    }

    // 如果没有空闲的且未达到上限，创建新的
    if (this.pages.length < this.options.maxPages) {
      const page = await browser.newPage();
      
      // 设置默认视口
      await page.setViewport({ width: 1920, height: 1080 });
      
      const pooled: PooledPage = {
        page,
        inUse: true,
        lastUsed: Date.now(),
      };
      
      this.pages.push(pooled);
      console.log(`[BrowserPool] Created new page, total: ${this.pages.length}`);
      return page;
    }

    // 达到上限，等待有空闲的 Page
    console.log(`[BrowserPool] Max pages reached (${this.options.maxPages}), waiting...`);
    return this.waitForFreePage();
  }

  /**
   * 等待空闲的 Page
   */
  private waitForFreePage(): Promise<Page> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available page'));
      }, 30000);

      const check = () => {
        for (const pooled of this.pages) {
          if (!pooled.inUse) {
            clearTimeout(timeout);
            pooled.inUse = true;
            pooled.lastUsed = Date.now();
            resolve(pooled.page);
            return;
          }
        }
        setTimeout(check, 100);
      };

      check();
    });
  }

  /**
   * 释放 Page 回池中
   */
  releasePage(page: Page): void {
    for (const pooled of this.pages) {
      if (pooled.page === page) {
        pooled.inUse = false;
        pooled.lastUsed = Date.now();
        console.log(`[BrowserPool] Page released, active: ${this.getActiveCount()}/${this.pages.length}`);
        return;
      }
    }
  }

  /**
   * 获取当前活跃（使用中）的 Page 数量
   */
  private getActiveCount(): number {
    return this.pages.filter(p => p.inUse).length;
  }

  /**
   * 健康检查：清理空闲过久的 Page，检查浏览器状态
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.cleanupIdlePages();
      await this.checkBrowserHealth();
    }, this.options.healthCheckInterval);
  }

  /**
   * 清理空闲过久的 Page
   */
  private async cleanupIdlePages(): Promise<void> {
    const now = Date.now();
    const toRemove: PooledPage[] = [];

    for (const pooled of this.pages) {
      // 保留至少 1 个 Page
      if (this.pages.length - toRemove.length <= 1) {
        break;
      }

      // 如果 Page 空闲超过阈值，标记为待清理
      if (!pooled.inUse && (now - pooled.lastUsed > this.options.pageIdleTimeout)) {
        toRemove.push(pooled);
      }
    }

    for (const pooled of toRemove) {
      try {
        await pooled.page.close();
        const index = this.pages.indexOf(pooled);
        if (index > -1) {
          this.pages.splice(index, 1);
        }
        console.log(`[BrowserPool] Closed idle page, remaining: ${this.pages.length}`);
      } catch {
        // Ignore close errors
      }
    }
  }

  /**
   * 检查浏览器健康状态
   */
  private async checkBrowserHealth(): Promise<void> {
    if (!this.browser) {
      return;
    }

    try {
      // 简单的健康检查：尝试获取版本
      await this.browser.version();
    } catch (error) {
      console.error('[BrowserPool] Browser health check failed, will restart on next request');
      this.browser = null;
      this.pages = [];
    }
  }

  /**
   * 关闭浏览器池
   */
  async shutdown(): Promise<void> {
    console.log('[BrowserPool] Shutting down...');
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 等待所有 Page 释放
    const maxWait = 10000;
    const startWait = Date.now();
    while (this.getActiveCount() > 0 && Date.now() - startWait < maxWait) {
      await new Promise(r => setTimeout(r, 100));
    }

    // 关闭所有 Page
    for (const pooled of this.pages) {
      try {
        await pooled.page.close();
      } catch {
        // Ignore
      }
    }
    this.pages = [];

    // 关闭浏览器
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore
      }
      this.browser = null;
    }

    console.log('[BrowserPool] Shutdown complete');
  }

  /**
   * 获取池状态（用于监控）
   */
  getStatus(): { browserConnected: boolean; totalPages: number; activePages: number } {
    return {
      browserConnected: this.browser?.isConnected() ?? false,
      totalPages: this.pages.length,
      activePages: this.getActiveCount(),
    };
  }
}

// 全局单例
export const browserPool = new BrowserPool({
  maxPages: parseInt(process.env.BROWSER_POOL_MAX_PAGES ?? '4', 10),
  pageIdleTimeout: parseInt(process.env.BROWSER_POOL_PAGE_IDLE_TIMEOUT ?? '60000', 10),
  healthCheckInterval: parseInt(process.env.BROWSER_POOL_HEALTH_CHECK_INTERVAL ?? '30000', 10),
});

// 优雅关闭
process.on('SIGTERM', async () => {
  await browserPool.shutdown();
});

process.on('SIGINT', async () => {
  await browserPool.shutdown();
});
