/**
 * mermaid.ink compatible routes
 * 
 * Provides the same URL format as mermaid.ink:
 * - GET /img/:code - Returns image (PNG/JPEG/WebP)
 * - GET /svg/:code - Returns SVG
 * - GET /pdf/:code - Returns PDF
 * 
 * The code parameter supports multiple encoding formats:
 * - pako:<base64> - Explicit pako compressed (mermaid.ink standard format)
 * - <base64> - Auto-detect: pako compressed (0x78 header) or plain base64
 * 
 * Example URLs:
 * - /img/pako:eNpNkM9qwzAMh19F6NRB8wI5DN... (pako compressed)
 * - /svg/eyJjb2RlIjoiZ3JhcGggVEQiLi4u (plain base64 JSON)
 * 
 * Query parameters:
 * - type: Image type for /img endpoint (png, jpeg, webp). Default: png
 * - theme: Mermaid theme (default, forest, dark, neutral)
 * - bgColor: Background color (hex without #, or !colorname)
 * - width: Image width
 * - height: Image height
 * - scale: Scale factor (1-3, only works with width/height)
 * - return: Return format (binary, base64, url). Default: binary
 *   - binary: Returns raw image data (default)
 *   - base64: Returns JSON with base64 encoded image
 *   - url: Uploads to COS and returns JSON with URL
 * - urlType: URL type for COS (internal, external). Default: use global config
 * - expires: Signed URL expiration in seconds (for return=url). Default: 0 (permanent URL)
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as zlib from 'zlib';
import { promisify } from 'util';
import {
  generateMermaidDiagram,
  MermaidFormat,
  MermaidTheme,
  VALID_THEMES,
  RenderError,
  RenderTimeoutError,
} from '../services/mermaid';
import {
  uploadToCosWithCacheKey,
  isCosConfigured,
  CosUploadError,
  checkCosByCacheKey,
} from '../services/cos';
import {
  getFromCache,
  saveToCache,
  generateCacheKey,
  isCacheEnabled,
} from '../services/cache';

const router = Router();
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);

// Return format types
type ReturnFormat = 'binary' | 'base64' | 'url';
const VALID_RETURN_FORMATS: ReturnFormat[] = ['binary', 'base64', 'url'];

// URL type for COS
type UrlType = 'internal' | 'external';
const VALID_URL_TYPES: UrlType[] = ['internal', 'external'];

/**
 * Get content type for format
 */
function getContentTypeForFormat(format: MermaidFormat): string {
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
 * Decode mermaid.ink style encoded string
 * Supports:
 * - pako: prefix for explicit pako compression (mermaid.ink format)
 * - Auto-detect pako compression (0x78 header)
 * - Plain base64 encoded JSON or text
 */
async function decodeBase64(encoded: string): Promise<string> {
  try {
    let base64Data = encoded;
    let forcePako = false;

    // Check for explicit pako: prefix (mermaid.ink format)
    if (encoded.startsWith('pako:')) {
      base64Data = encoded.slice(5); // Remove 'pako:' prefix
      forcePako = true;
    }

    // URL-safe base64 to standard base64
    let base64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }

    const buffer = Buffer.from(base64, 'base64');
    
    // Check if it's pako/zlib compressed (starts with 0x78 or has pako: prefix)
    if (forcePako || buffer[0] === 0x78) {
      let decompressedStr: string;
      try {
        const decompressed = await inflate(buffer);
        decompressedStr = decompressed.toString('utf-8');
      } catch {
        // Try raw deflate
        const decompressed = await inflateRaw(buffer);
        decompressedStr = decompressed.toString('utf-8');
      }
      
      // Try to parse decompressed data as JSON
      try {
        const json = JSON.parse(decompressedStr);
        if (json.code) {
          return json.code;
        }
      } catch {
        // Not JSON, return as plain text
      }
      return decompressedStr;
    }

    // Try to parse as JSON (mermaid.live format, non-compressed)
    const decoded = buffer.toString('utf-8');
    try {
      const json = JSON.parse(decoded);
      if (json.code) {
        return json.code;
      }
    } catch {
      // Not JSON, return as plain text
    }

    return decoded;
  } catch (error) {
    throw new Error(`Failed to decode: ${(error as Error).message}`);
  }
}

/**
 * Parse background color from mermaid.ink format
 * - Hex without #: FF0000 -> #FF0000
 * - Named color with !: !white -> white
 */
function parseBackgroundColor(bgColor: string | undefined): string | undefined {
  if (!bgColor) return undefined;
  
  if (bgColor.startsWith('!')) {
    return bgColor.slice(1); // Named color
  }
  
  // Hex color
  return `#${bgColor}`;
}

/**
 * Common handler for rendering diagrams
 */
async function handleRender(
  req: Request,
  res: Response,
  next: NextFunction,
  defaultFormat: MermaidFormat
): Promise<void> {
  try {
    const encoded = req.params.code;
    
    if (!encoded) {
      res.status(400).json({
        code: 400,
        message: 'Encoded mermaid code is required',
        data: null,
      });
      return;
    }

    // Decode the mermaid code
    let code: string;
    try {
      code = await decodeBase64(encoded);
    } catch (error) {
      res.status(400).json({
        code: 400,
        message: `Invalid encoded data: ${(error as Error).message}`,
        data: null,
      });
      return;
    }

    // Parse query parameters
    const {
      type,
      theme,
      bgColor,
      width,
      height,
      scale,
    } = req.query;
    
    // Parse return format
    const returnFormat = (req.query.return as string)?.toLowerCase() as ReturnFormat || 'binary';
    if (!VALID_RETURN_FORMATS.includes(returnFormat)) {
      res.status(400).json({
        code: 400,
        message: `Invalid return format. Valid formats: ${VALID_RETURN_FORMATS.join(', ')}`,
        data: null,
      });
      return;
    }

    // Parse URL type (for return=url)
    const urlType = (req.query.urlType as string)?.toLowerCase() as UrlType | undefined;
    if (urlType && !VALID_URL_TYPES.includes(urlType)) {
      res.status(400).json({
        code: 400,
        message: `Invalid urlType. Valid types: ${VALID_URL_TYPES.join(', ')}`,
        data: null,
      });
      return;
    }

    // Check COS configuration for URL return format
    if (returnFormat === 'url' && !isCosConfigured()) {
      res.status(400).json({
        code: 400,
        message: 'COS is not configured. Cannot use return=url. Please set COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, and COS_REGION environment variables.',
        data: null,
      });
      return;
    }

    // Parse expires (for return=url)
    const expiresStr = req.query.expires as string | undefined;
    const expires = expiresStr ? parseInt(expiresStr, 10) : undefined;
    if (expires !== undefined && (isNaN(expires) || expires < 0)) {
      res.status(400).json({
        code: 400,
        message: 'expires must be a non-negative number (seconds)',
        data: null,
      });
      return;
    }

    // Determine format
    let format: MermaidFormat = defaultFormat;
    if (defaultFormat === 'png' && type) {
      const typeStr = String(type).toLowerCase();
      if (typeStr === 'png' || typeStr === 'jpeg' || typeStr === 'webp') {
        format = 'png'; // We only support png for raster, but accept the params
      }
    }

    // Validate theme
    const themeValue = theme ? String(theme) : 'default';
    if (!VALID_THEMES.includes(themeValue as MermaidTheme)) {
      res.status(400).json({
        code: 400,
        message: `Invalid theme. Valid themes: ${VALID_THEMES.join(', ')}`,
        data: null,
      });
      return;
    }

    // Parse dimensions
    let parsedWidth = width ? parseInt(String(width), 10) : undefined;
    let parsedHeight = height ? parseInt(String(height), 10) : undefined;
    const parsedScale = scale ? parseInt(String(scale), 10) : 1;

    // Apply scale
    if (parsedScale > 1 && parsedScale <= 3) {
      if (parsedWidth) parsedWidth *= parsedScale;
      if (parsedHeight) parsedHeight *= parsedScale;
    }

    // Parse background color
    const backgroundColor = parseBackgroundColor(bgColor as string | undefined) || 'white';

    // 生成缓存 key
    const cacheKey = generateCacheKey({
      code,
      format,
      theme: themeValue,
      width: parsedWidth,
      height: parsedHeight,
      backgroundColor,
    });

    // 对于 return=url，先检查 COS 是否已存在（最快路径）
    if (returnFormat === 'url') {
      const cosCheck = await checkCosByCacheKey(cacheKey, format, urlType, expires);
      if (cosCheck.exists && cosCheck.url && cosCheck.key) {
        // COS 已存在，直接返回 URL，无需渲染
        const responseData: Record<string, unknown> = {
          format,
          contentType: getContentTypeForFormat(format),
          url: cosCheck.url,
          key: cosCheck.key,
          cached: true,
          cacheSource: 'cos',
        };
        if (cosCheck.expiresAt) {
          responseData.expiresAt = cosCheck.expiresAt;
        }
        res.json({
          code: 200,
          message: '',
          data: responseData,
        });
        return;
      }
    }

    // 检查本地缓存
    let renderData: Buffer;
    let contentType: string;
    let cacheHit = false;
    let cacheSource: 'local' | 'none' = 'none';

    const localCache = await getFromCache({
      code,
      format,
      theme: themeValue,
      width: parsedWidth,
      height: parsedHeight,
      backgroundColor,
    });

    if (localCache) {
      // 本地缓存命中
      renderData = localCache.data;
      contentType = localCache.contentType;
      cacheHit = true;
      cacheSource = 'local';
    } else {
      // 本地缓存未命中，执行渲染
      const result = await generateMermaidDiagram({
        code,
        format,
        theme: themeValue as MermaidTheme,
        width: parsedWidth,
        height: parsedHeight,
        backgroundColor,
      });

      renderData = result.data;
      contentType = result.contentType;

      // 保存到本地缓存（异步，不阻塞响应）
      if (isCacheEnabled()) {
        saveToCache({
          code,
          format,
          theme: themeValue,
          width: parsedWidth,
          height: parsedHeight,
          backgroundColor,
        }, renderData).catch((err) => {
          console.error('[Cache] Save error:', err);
        });
      }
    }

    // Handle different return formats
    switch (returnFormat) {
      case 'base64': {
        // Return base64 encoded image
        const base64Data = renderData.toString('base64');
        res.json({
          code: 200,
          message: '',
          data: {
            format,
            contentType,
            base64: base64Data,
            dataUrl: `data:${contentType};base64,${base64Data}`,
            cached: cacheHit,
            cacheSource: cacheHit ? cacheSource : undefined,
          },
        });
        break;
      }
      
      case 'url': {
        // Upload to COS and return URL (使用 cacheKey)
        const uploadResult = await uploadToCosWithCacheKey({
          data: renderData,
          format,
          cacheKey,
          urlType,
          expires,
        });
        const urlResponseData: Record<string, unknown> = {
          format,
          contentType,
          url: uploadResult.url,
          key: uploadResult.key,
          cached: cacheHit || uploadResult.cached,
          cacheSource: cacheHit ? cacheSource : (uploadResult.cached ? 'cos' : undefined),
        };
        if (uploadResult.expiresAt) {
          urlResponseData.expiresAt = uploadResult.expiresAt;
        }
        res.json({
          code: 200,
          message: '',
          data: urlResponseData,
        });
        break;
      }
      
      case 'binary':
      default: {
        // Return raw binary data (default behavior)
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        // 添加缓存信息到 header
        if (cacheHit) {
          res.setHeader('X-Cache-Hit', 'true');
          res.setHeader('X-Cache-Source', cacheSource);
        }
        res.send(renderData);
        break;
      }
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /svg/:code
 * Returns SVG image (mermaid.ink compatible)
 */
router.get('/svg/:code', (req, res, next) => handleRender(req, res, next, 'svg'));

/**
 * GET /img/:code
 * Returns raster image (mermaid.ink compatible)
 * Query params: type=png|jpeg|webp (default: png)
 */
router.get('/img/:code', (req, res, next) => handleRender(req, res, next, 'png'));

/**
 * GET /pdf/:code
 * Returns PDF document
 */
router.get('/pdf/:code', (req, res, next) => handleRender(req, res, next, 'pdf'));

/**
 * Error handler for compatible routes
 */
export function compatibleErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof RenderTimeoutError) {
    res.status(504).json({
      code: 504,
      message: err.message,
      data: null,
    });
    return;
  }

  if (err instanceof RenderError) {
    res.status(400).json({
      code: 400,
      message: err.message,
      data: null,
    });
    return;
  }

  if (err instanceof CosUploadError) {
    res.status(500).json({
      code: 500,
      message: err.message,
      data: null,
    });
    return;
  }

  next(err);
}

export default router;
