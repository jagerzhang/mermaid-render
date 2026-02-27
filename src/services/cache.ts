/**
 * 本地文件缓存服务
 * 
 * 基于 mermaid code + format + theme 等参数生成唯一 key
 * 缓存渲染后的图片，避免重复渲染
 * 
 * Environment variables:
 * - CACHE_DIR: 缓存目录路径 (default: /tmp/mermaid-cache)
 * - CACHE_MAX_AGE: 缓存过期时间，单位秒 (default: 86400 = 24小时)
 * - CACHE_ENABLED: 是否启用缓存 (default: true)
 */

import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

// 缓存配置
const config = {
  cacheDir: process.env.CACHE_DIR || '/tmp/mermaid-cache',
  maxAge: parseInt(process.env.CACHE_MAX_AGE || '86400', 10) * 1000, // 转换为毫秒
  enabled: process.env.CACHE_ENABLED !== 'false',
};

export interface CacheKey {
  code: string;
  format: string;
  theme?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  /** 缩放倍数，影响清晰度 */
  scale?: number;
}

export interface CacheResult {
  data: Buffer;
  contentType: string;
  /** 缓存的 key (MD5) */
  cacheKey: string;
}

/**
 * 确保缓存目录存在
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.promises.mkdir(config.cacheDir, { recursive: true });
  } catch (err) {
    // 目录已存在则忽略
  }
}

/**
 * 根据参数生成缓存 key (MD5)
 * 使用 code + format + theme + width + height + backgroundColor + scale 生成唯一标识
 */
export function generateCacheKey(options: CacheKey): string {
  const {
    code,
    format,
    theme = 'default',
    width,
    height,
    backgroundColor = 'white',
    scale = 1,
  } = options;
  
  // 组合所有影响渲染结果的参数
  const keyContent = JSON.stringify({
    code,
    format,
    theme,
    width: width || null,
    height: height || null,
    backgroundColor,
    scale,
  });
  
  return crypto.createHash('md5').update(keyContent).digest('hex');
}

/**
 * 获取缓存文件路径
 * 使用 MD5 前4位作为子目录，分散文件存储
 */
function getCacheFilePath(cacheKey: string, format: string): string {
  const prefix = cacheKey.substring(0, 4);
  const subDir = path.join(config.cacheDir, prefix);
  return path.join(subDir, `${cacheKey}.${format}`);
}

/**
 * 从本地缓存获取图片
 * 返回 null 表示缓存未命中或已过期
 */
export async function getFromCache(options: CacheKey): Promise<CacheResult | null> {
  if (!config.enabled) {
    return null;
  }
  
  const cacheKey = generateCacheKey(options);
  const filePath = getCacheFilePath(cacheKey, options.format);
  
  try {
    // 检查文件是否存在
    const stat = await fs.promises.stat(filePath);
    
    // 检查是否过期
    const age = Date.now() - stat.mtimeMs;
    if (age > config.maxAge) {
      // 缓存过期，删除文件
      await fs.promises.unlink(filePath).catch(() => {});
      console.log(`[Cache] Expired: ${cacheKey} (age: ${Math.round(age / 1000)}s)`);
      return null;
    }
    
    // 读取缓存文件
    const data = await fs.promises.readFile(filePath);
    const contentType = getContentTypeForFormat(options.format);
    
    console.log(`[Cache] Hit: ${cacheKey}`);
    return { data, contentType, cacheKey };
  } catch {
    // 文件不存在或读取失败
    return null;
  }
}

/**
 * 获取 content type
 */
function getContentTypeForFormat(format: string): string {
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
 * 保存图片到本地缓存
 */
export async function saveToCache(options: CacheKey, data: Buffer): Promise<string> {
  if (!config.enabled) {
    return generateCacheKey(options);
  }
  
  const cacheKey = generateCacheKey(options);
  const filePath = getCacheFilePath(cacheKey, options.format);
  const dirPath = path.dirname(filePath);
  
  try {
    // 确保目录存在
    await fs.promises.mkdir(dirPath, { recursive: true });
    
    // 写入缓存文件
    await fs.promises.writeFile(filePath, data);
    
    console.log(`[Cache] Saved: ${cacheKey}`);
  } catch (err) {
    console.error(`[Cache] Save failed: ${cacheKey}`, err);
  }
  
  return cacheKey;
}

/**
 * 获取缓存 key 对应的 COS 文件路径
 * 与 cos.ts 中的路径生成逻辑保持一致
 */
export function getCosKeyByCacheKey(cacheKey: string, format: string): string {
  const pathPrefix = process.env.COS_PATH_PREFIX || 'mermaid/';
  const prefix = cacheKey.substring(0, 4);
  return `${pathPrefix}${prefix}/${cacheKey}.${format}`;
}

/**
 * 检查缓存是否启用
 */
export function isCacheEnabled(): boolean {
  return config.enabled;
}

/**
 * 清理过期缓存 (可选，用于定期清理)
 */
export async function cleanExpiredCache(): Promise<number> {
  if (!config.enabled) {
    return 0;
  }
  
  await ensureCacheDir();
  
  let cleanedCount = 0;
  const now = Date.now();
  
  try {
    // 遍历所有子目录
    const subDirs = await fs.promises.readdir(config.cacheDir);
    
    for (const subDir of subDirs) {
      const subDirPath = path.join(config.cacheDir, subDir);
      const stat = await fs.promises.stat(subDirPath);
      
      if (!stat.isDirectory()) {
        continue;
      }
      
      // 遍历子目录中的文件
      const files = await fs.promises.readdir(subDirPath);
      
      for (const file of files) {
        const filePath = path.join(subDirPath, file);
        try {
          const fileStat = await fs.promises.stat(filePath);
          const age = now - fileStat.mtimeMs;
          
          if (age > config.maxAge) {
            await fs.promises.unlink(filePath);
            cleanedCount++;
          }
        } catch {
          // 忽略单个文件的错误
        }
      }
    }
  } catch {
    // 忽略目录遍历错误
  }
  
  if (cleanedCount > 0) {
    console.log(`[Cache] Cleaned ${cleanedCount} expired files`);
  }
  
  return cleanedCount;
}

// 初始化：确保缓存目录存在
ensureCacheDir().catch(() => {});
