/**
 * COS (Cloud Object Storage) upload service
 * 
 * Environment variables:
 * - COS_SECRET_ID: Tencent Cloud SecretId
 * - COS_SECRET_KEY: Tencent Cloud SecretKey
 * - COS_BUCKET: COS bucket name (e.g., my-bucket-1250000000)
 * - COS_REGION: COS region (e.g., ap-guangzhou)
 * - COS_INTERNAL: (Optional) Use internal network (true/false, default: false)
 *   ⚠️ 注意：内网域名 (cos-internal) 只能在腾讯云 VPC 内访问，
 *   如果你的 K8S 不在腾讯云，请设置为 false
 * - COS_BASE_URL: (Optional) Custom CDN/domain URL prefix (overrides internal/external)
 * - COS_PATH_PREFIX: (Optional) Path prefix for uploaded files (default: mermaid/)
 * - COS_HEAD_TIMEOUT_MS: (Optional) COS head/check timeout in ms (default: 2000, 快速失败)
 * - COS_UPLOAD_TIMEOUT_MS: (Optional) COS upload timeout in ms (default: 60000)
 * - COS_DEFAULT_EXPIRES: (Optional) Default signed URL expiration in seconds (default: 0, 表示返回永久URL)
 */

import COS from 'cos-nodejs-sdk-v5';
import crypto from 'crypto';

// Supported formats for COS
export type CosFormat = 'svg' | 'png' | 'pdf';

// COS configuration from environment variables
const config = {
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || '',
  bucket: process.env.COS_BUCKET || '',
  region: process.env.COS_REGION || '',
  internal: process.env.COS_INTERNAL === 'true', // 是否使用内网
  baseUrl: process.env.COS_BASE_URL || '',
  pathPrefix: process.env.COS_PATH_PREFIX || 'mermaid/',
  defaultExpires: parseInt(process.env.COS_DEFAULT_EXPIRES || '0', 10), // 默认不过期
};

/**
 * Build COS endpoint URL
 * 内网: <BucketName-APPID>.cos-internal.<Region>.tencentcos.cn
 * 外网: <BucketName-APPID>.cos.<Region>.tencentcos.cn
 * 
 * @param key - 文件路径
 * @param urlType - 返回 URL 类型：'internal' | 'external'，默认使用全局配置
 * @param expires - 签名URL有效期（秒），0 表示返回永久URL（需要文件是公共读）
 */
export function buildCosUrl(key: string, urlType?: 'internal' | 'external', expires?: number): string {
  if (config.baseUrl) {
    // 自定义域名/CDN 优先（不支持签名URL）
    return `${config.baseUrl.replace(/\/$/, '')}/${key}`;
  }
  
  // urlType 参数优先，否则使用全局配置
  const useInternal = urlType ? urlType === 'internal' : config.internal;
  
  if (useInternal) {
    // 内网地址
    return `https://${config.bucket}.cos-internal.${config.region}.tencentcos.cn/${key}`;
  }
  
  // 外网地址
  return `https://${config.bucket}.cos.${config.region}.tencentcos.cn/${key}`;
}

/**
 * 获取签名 URL（带有效期）
 * 用于私有读取的 bucket 或需要限制访问时间的场景
 * 
 * @param key - 文件路径
 * @param expires - 有效期（秒），默认 3600（1小时）
 */
export function getSignedUrl(key: string, expires: number = 3600): Promise<string> {
  const cos = getCosClient();
  
  return new Promise((resolve, reject) => {
    // 使用类型断言，因为 SDK 类型定义不完整
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cos as any).getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Sign: true,
      Expires: expires,
    }, (err: COS.CosError | null, data: { Url: string }) => {
      if (err) {
        reject(new CosUploadError(`Failed to get signed URL: ${err.message}`));
        return;
      }
      resolve(data.Url);
    });
  });
}

/**
 * 根据配置获取 URL（支持签名URL和永久URL）
 * 
 * @param key - 文件路径
 * @param urlType - URL类型
 * @param expires - 有效期（秒），0 或 undefined 表示永久URL
 */
export async function getCosUrl(
  key: string,
  urlType?: 'internal' | 'external',
  expires?: number
): Promise<string> {
  // 使用传入的 expires，如果没有则使用全局默认配置
  const effectiveExpires = expires ?? config.defaultExpires;
  
  // 如果有效期 > 0，返回签名URL
  if (effectiveExpires > 0) {
    return getSignedUrl(key, effectiveExpires);
  }
  
  // 否则返回永久URL
  return buildCosUrl(key, urlType);
}

// Check if COS is configured
export function isCosConfigured(): boolean {
  return !!(config.secretId && config.secretKey && config.bucket && config.region);
}

// Create COS client (lazy initialization)
let cosClient: COS | null = null;

function getCosClient(): COS {
  if (!cosClient) {
    if (!isCosConfigured()) {
      throw new Error('COS is not configured. Please set COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, and COS_REGION environment variables.');
    }
    
    const cosOptions: COS.COSOptions = {
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    };
    
    // 如果使用内网，配置 SDK 使用内网域名
    if (config.internal) {
      cosOptions.Domain = `{Bucket}.cos-internal.{Region}.tencentcos.cn`;
    }
    
    cosClient = new COS(cosOptions);
  }
  return cosClient;
}

export interface UploadOptions {
  data: Buffer;
  format: CosFormat;
  filename?: string;
  /** 返回 URL 类型：'internal' 内网 | 'external' 外网，默认使用全局配置 */
  urlType?: 'internal' | 'external';
  /** 签名URL有效期（秒），0 或不传表示返回永久URL */
  expires?: number;
}

export interface UploadResult {
  url: string;
  key: string;
  /** 是否为已存在的文件（命中缓存） */
  cached: boolean;
  /** 如果是签名URL，返回过期时间戳 */
  expiresAt?: number;
}

/**
 * 获取文件扩展名
 */
function getExtension(format: CosFormat): string {
  return format; // svg, png, pdf
}

/**
 * 获取 Content-Type
 */
function getContentType(format: CosFormat): string {
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
 * 计算数据的 MD5 哈希值
 */
export function calculateMd5(data: Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * 根据 MD5 生成文件路径
 * 使用 MD5 前4位作为子目录，分散文件存储
 * 例如: mermaid/a1b2/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.png
 */
export function generateKeyByMd5(md5: string, ext: string): string {
  const prefix = md5.substring(0, 4);
  return `${config.pathPrefix}${prefix}/${md5}.${ext}`;
}

/**
 * 根据 cache key 直接生成 COS 文件路径
 * 用于在渲染前通过 code MD5 检查 COS 是否已存在
 */
export function generateKeyByCacheKey(cacheKey: string, ext: string): string {
  const prefix = cacheKey.substring(0, 4);
  return `${config.pathPrefix}${prefix}/${cacheKey}.${ext}`;
}

/**
 * 检查文件是否已存在于 COS（带超时）
 * 
 * 设计原则：快速失败，不阻塞
 * - 超时后当作"不存在"处理，触发重新上传
 * - COS 本身有内容去重（基于 MD5），重复上传不会产生问题
 * - 宁可多上传一次，也不要因为检查慢而阻塞请求
 */
export async function checkFileExists(key: string): Promise<boolean> {
  const cos = getCosClient();
  // 超时时间可通过环境变量配置，默认 2 秒（快速失败）
  // 大不了重新上传一次，不要阻塞
  const TIMEOUT_MS = parseInt(process.env.COS_HEAD_TIMEOUT_MS || '2000', 10);
  
  return new Promise((resolve) => {
    // 设置超时，超时后当作不存在处理
    const timer = setTimeout(() => {
      console.warn(`[COS] headObject timeout for key: ${key} (${TIMEOUT_MS}ms)`);
      resolve(false);
    }, TIMEOUT_MS);
    
    cos.headObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err: COS.CosError | null) => {
      clearTimeout(timer);
      if (err) {
        // 404 表示不存在，其他错误也当作不存在处理
        if (err.statusCode !== 404) {
          console.warn(`[COS] headObject error for key: ${key}:`, err.message || err.code);
        }
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export interface CheckCosResult {
  exists: boolean;
  url?: string;
  key?: string;
  /** 如果是签名URL，返回过期时间戳 */
  expiresAt?: number;
}

/**
 * 通过 cacheKey 检查 COS 是否已存在该图片
 * 如果存在，直接返回 URL；如果不存在，返回 exists: false
 * 用于在渲染前判断是否需要渲染
 */
export async function checkCosByCacheKey(
  cacheKey: string,
  format: string,
  urlType?: 'internal' | 'external',
  expires?: number
): Promise<CheckCosResult> {
  if (!isCosConfigured()) {
    return { exists: false };
  }
  
  const ext = format; // svg, png, pdf
  const key = generateKeyByCacheKey(cacheKey, ext);
  
  const fileExists = await checkFileExists(key);
  
  if (fileExists) {
    const url = await getCosUrl(key, urlType, expires);
    console.log(`[COS] Cache hit: ${key}`);
    
    // 计算过期时间戳
    const effectiveExpires = expires ?? config.defaultExpires;
    const expiresAt = effectiveExpires > 0 ? Math.floor(Date.now() / 1000) + effectiveExpires : undefined;
    
    return { exists: true, url, key, expiresAt };
  }
  
  return { exists: false };
}

export interface UploadWithCacheKeyOptions {
  data: Buffer;
  format: string;
  /** 预先计算好的 cache key，用于指定 COS 文件路径 */
  cacheKey: string;
  /** 返回 URL 类型：'internal' 内网 | 'external' 外网，默认使用全局配置 */
  urlType?: 'internal' | 'external';
  /** 签名URL有效期（秒），0 或不传表示返回永久URL */
  expires?: number;
}

/**
 * Upload image to COS (使用预先计算好的 cacheKey)
 * 用于本地缓存命中后上传到 COS
 */
export async function uploadToCosWithCacheKey(options: UploadWithCacheKeyOptions): Promise<UploadResult> {
  const { data, format, cacheKey, urlType, expires } = options;
  
  const cos = getCosClient();
  
  // 使用 cacheKey 生成文件路径
  const ext = format; // svg, png, pdf
  const contentType = getContentType(format as CosFormat);
  const key = generateKeyByCacheKey(cacheKey, ext);
  
  // 检查文件是否已存在
  const fileExists = await checkFileExists(key);
  
  if (fileExists) {
    // 文件已存在，直接返回 URL
    const url = await getCosUrl(key, urlType, expires);
    const effectiveExpires = expires ?? config.defaultExpires;
    const expiresAt = effectiveExpires > 0 ? Math.floor(Date.now() / 1000) + effectiveExpires : undefined;
    return { url, key, cached: true, expiresAt };
  }
  
  // 文件不存在，执行上传（带超时）
  // 超时时间可通过环境变量配置，默认 60 秒
  const UPLOAD_TIMEOUT_MS = parseInt(process.env.COS_UPLOAD_TIMEOUT_MS || '60000', 10);
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CosUploadError(`Upload timeout after ${UPLOAD_TIMEOUT_MS}ms`));
    }, UPLOAD_TIMEOUT_MS);
    
    cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: data,
      ContentType: contentType,
      // Make the file publicly readable
      ACL: 'public-read',
    }, async (err: COS.CosError | null) => {
      clearTimeout(timer);
      if (err) {
        reject(new CosUploadError(`Failed to upload to COS: ${err.message}`));
        return;
      }
      
      // Build URL - 用户可通过 urlType 指定返回内网或外网 URL
      const url = await getCosUrl(key, urlType, expires);
      const effectiveExpires = expires ?? config.defaultExpires;
      const expiresAt = effectiveExpires > 0 ? Math.floor(Date.now() / 1000) + effectiveExpires : undefined;
      
      resolve({ url, key, cached: false, expiresAt });
    });
  });
}

/**
 * Upload image to COS
 * 基于内容 MD5 去重：相同内容只上传一次，已存在则直接返回 URL
 */
export async function uploadToCos(options: UploadOptions): Promise<UploadResult> {
  const { data, format, urlType, expires } = options;
  
  const cos = getCosClient();
  
  // 计算内容 MD5
  const md5 = calculateMd5(data);
  
  // 生成基于 MD5 的文件路径
  const ext = getExtension(format);
  const contentType = getContentType(format);
  const key = generateKeyByMd5(md5, ext);
  
  // 检查文件是否已存在
  const fileExists = await checkFileExists(key);
  
  if (fileExists) {
    // 文件已存在，直接返回 URL
    const url = await getCosUrl(key, urlType, expires);
    const effectiveExpires = expires ?? config.defaultExpires;
    const expiresAt = effectiveExpires > 0 ? Math.floor(Date.now() / 1000) + effectiveExpires : undefined;
    return { url, key, cached: true, expiresAt };
  }
  
  // 文件不存在，执行上传（带超时）
  // 超时时间可通过环境变量配置，默认 60 秒
  const UPLOAD_TIMEOUT_MS = parseInt(process.env.COS_UPLOAD_TIMEOUT_MS || '60000', 10);
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CosUploadError(`Upload timeout after ${UPLOAD_TIMEOUT_MS}ms`));
    }, UPLOAD_TIMEOUT_MS);
    
    cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: data,
      ContentType: contentType,
      // Make the file publicly readable
      ACL: 'public-read',
    }, async (err: COS.CosError | null) => {
      clearTimeout(timer);
      if (err) {
        reject(new CosUploadError(`Failed to upload to COS: ${err.message}`));
        return;
      }
      
      // Build URL - 用户可通过 urlType 指定返回内网或外网 URL
      const url = await getCosUrl(key, urlType, expires);
      const effectiveExpires = expires ?? config.defaultExpires;
      const expiresAt = effectiveExpires > 0 ? Math.floor(Date.now() / 1000) + effectiveExpires : undefined;
      
      resolve({ url, key, cached: false, expiresAt });
    });
  });
}

/**
 * Custom error for COS upload failures
 */
export class CosUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CosUploadError';
  }
}
