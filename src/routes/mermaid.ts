import { Router, Request, Response, NextFunction } from 'express';
import {
  generateMermaidDiagram,
  MermaidFormat,
  MermaidTheme,
  VALID_FORMATS,
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

interface GenerateRequestBody {
  code?: string;
  format?: string;
  theme?: string;
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  return?: string;  // Return format: binary, base64, url
  urlType?: string; // URL type for COS: internal, external
  expires?: number | string; // Signed URL expiration in seconds (for return=url)
}

/**
 * POST /api/mermaid/generate
 * Generate a Mermaid diagram from code
 * 
 * Request body:
 * - code: Mermaid diagram code (required)
 * - format: Output format (svg, png, pdf). Default: svg
 * - theme: Mermaid theme (default, forest, dark, neutral). Default: default
 * - width: Image width
 * - height: Image height
 * - backgroundColor: Background color
 * - return: Return format (binary, base64, url). Default: binary
 * - urlType: URL type for COS (internal, external). Default: use global config
 * - expires: Signed URL expiration in seconds (for return=url). Default: 0 (permanent URL)
 */
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as GenerateRequestBody;
    const { code, format, theme, width, height, backgroundColor } = body;

    // Validate required fields
    if (!code || typeof code !== 'string' || code.trim() === '') {
      res.status(400).json({
        code: 400,
        message: 'Mermaid code is required',
        data: null,
      });
      return;
    }

    // Parse return format
    const returnFormat = (body.return?.toLowerCase() as ReturnFormat) || 'binary';
    if (!VALID_RETURN_FORMATS.includes(returnFormat)) {
      res.status(400).json({
        code: 400,
        message: `Invalid return format. Valid formats: ${VALID_RETURN_FORMATS.join(', ')}`,
        data: null,
      });
      return;
    }

    // Parse URL type (for return=url)
    const urlType = body.urlType?.toLowerCase() as UrlType | undefined;
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
    const expires = body.expires ? parseInt(String(body.expires), 10) : undefined;
    if (expires !== undefined && (isNaN(expires) || expires < 0)) {
      res.status(400).json({
        code: 400,
        message: 'expires must be a non-negative number (seconds)',
        data: null,
      });
      return;
    }

    // Validate format
    if (format && !VALID_FORMATS.includes(format as MermaidFormat)) {
      res.status(400).json({
        code: 400,
        message: `Invalid format. Valid formats: ${VALID_FORMATS.join(', ')}`,
        data: null,
      });
      return;
    }

    // Validate theme
    if (theme && !VALID_THEMES.includes(theme as MermaidTheme)) {
      res.status(400).json({
        code: 400,
        message: `Invalid theme. Valid themes: ${VALID_THEMES.join(', ')}`,
        data: null,
      });
      return;
    }

    // Parse dimensions
    const parsedWidth = width ? parseInt(String(width), 10) : undefined;
    const parsedHeight = height ? parseInt(String(height), 10) : undefined;

    if (width && (isNaN(parsedWidth!) || parsedWidth! <= 0)) {
      res.status(400).json({
        code: 400,
        message: 'Width must be a positive number',
        data: null,
      });
      return;
    }

    if (height && (isNaN(parsedHeight!) || parsedHeight! <= 0)) {
      res.status(400).json({
        code: 400,
        message: 'Height must be a positive number',
        data: null,
      });
      return;
    }

    const outputFormat = (format as MermaidFormat) || 'svg';
    const outputTheme = (theme as MermaidTheme) || 'default';
    const bgColor = backgroundColor || 'white';

    // 生成缓存 key（基于所有影响渲染结果的参数）
    const cacheKey = generateCacheKey({
      code: code.trim(),
      format: outputFormat,
      theme: outputTheme,
      width: parsedWidth,
      height: parsedHeight,
      backgroundColor: bgColor,
    });

    // 对于 return=url，先检查 COS 是否已存在（最快路径）
    if (returnFormat === 'url') {
      const cosCheck = await checkCosByCacheKey(cacheKey, outputFormat, urlType, expires);
      if (cosCheck.exists && cosCheck.url && cosCheck.key) {
        // COS 已存在，直接返回 URL，无需渲染
        const responseData: Record<string, unknown> = {
          format: outputFormat,
          contentType: getContentTypeForFormat(outputFormat),
          url: cosCheck.url,
          key: cosCheck.key,
          cached: true,
          cacheSource: 'cos',  // 标记缓存来源
        };
        // 如果是签名URL，返回过期时间
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
      code: code.trim(),
      format: outputFormat,
      theme: outputTheme,
      width: parsedWidth,
      height: parsedHeight,
      backgroundColor: bgColor,
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
        code: code.trim(),
        format: outputFormat,
        theme: outputTheme,
        width: parsedWidth,
        height: parsedHeight,
        backgroundColor: bgColor,
      });
      
      renderData = result.data;
      contentType = result.contentType;

      // 保存到本地缓存（异步，不阻塞响应）
      if (isCacheEnabled()) {
        saveToCache({
          code: code.trim(),
          format: outputFormat,
          theme: outputTheme,
          width: parsedWidth,
          height: parsedHeight,
          backgroundColor: bgColor,
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
            format: outputFormat,
            contentType,
            dataUrlPrefix: `data:${contentType};base64,`,
            base64: base64Data,
            cached: cacheHit,
            cacheSource: cacheHit ? cacheSource : undefined,
          },
        });
        break;
      }
      
      case 'url': {
        // Upload to COS and return URL (使用 cacheKey 作为文件名)
        const uploadResult = await uploadToCosWithCacheKey({
          data: renderData,
          format: outputFormat,
          cacheKey,
          urlType,
          expires,
        });
        const urlResponseData: Record<string, unknown> = {
          format: outputFormat,
          contentType,
          url: uploadResult.url,
          key: uploadResult.key,
          cached: cacheHit || uploadResult.cached,
          cacheSource: cacheHit ? cacheSource : (uploadResult.cached ? 'cos' : undefined),
        };
        // 如果是签名URL，返回过期时间
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
        res.setHeader(
          'Content-Disposition',
          `inline; filename="mermaid-diagram.${outputFormat}"`
        );
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
});

/**
 * Error handler for mermaid routes
 */
export function mermaidErrorHandler(
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

  // Pass to default error handler
  next(err);
}

export default router;
