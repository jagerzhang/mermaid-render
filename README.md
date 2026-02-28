# Mermaid Render

基于 Mermaid.js 的 HTTP API 服务，通过简单的 HTTP 请求将 Mermaid 代码转换为 SVG、PNG 或 PDF，支持上传到腾讯云 COS 并返回 URL。

## 功能特性

- ✅ 支持 SVG、PNG、PDF 输出格式
- ✅ 支持多种 Mermaid 主题 (default, forest, dark, neutral)
- ✅ 支持自定义输出尺寸和背景颜色
- ✅ **多种返回格式**：二进制流、Base64、COS URL
- ✅ **腾讯云 COS 集成**：自动上传并返回访问 URL
- ✅ **签名 URL 支持**：可指定 URL 有效期
- ✅ **智能缓存**：基于内容 MD5 去重，相同内容秒级返回
- ✅ **内外网 URL 支持**：可指定返回内网或外网访问地址
- ✅ **mermaid.ink 兼容接口**：无缝替换现有服务
- ✅ **Browser Pool 优化**：可选启用浏览器池，大幅提升渲染性能
- ✅ Docker 容器化部署
- ✅ 健康检查端点

## 快速开始

### 使用 Docker Compose（推荐）

1. 复制环境变量配置文件：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，配置 COS 参数（可选，不配置则无法使用 `return=url` 功能）：

```bash
# COS 配置（可选）
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_BUCKET=your-bucket-1250000000
COS_REGION=ap-guangzhou
COS_INTERNAL=true  # 使用内网上传
```

3. 启动服务：

```bash
docker-compose up -d
```

4. 验证服务：

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建
npm run build

# 生产模式运行
npm start
```

### 手动 Docker 部署

```bash
# 构建镜像
docker build -t mermaid-render .

# 运行容器
docker run -d -p 3000:3000 \
  -e COS_SECRET_ID=xxx \
  -e COS_SECRET_KEY=xxx \
  -e COS_BUCKET=xxx \
  -e COS_REGION=ap-guangzhou \
  --name mermaid-render mermaid-render
```

---

## API 文档

### 1. 健康检查

检查服务是否正常运行。

```http
GET /health
```

**响应示例：**

```json
{
  "status": "ok"
}
```

---

### 2. 生成图表（主接口）

将 Mermaid 代码渲染为图片。

```http
POST /api/mermaid/generate
Content-Type: application/json
```

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|--------|------|
| `code` | string | ✅ | - | Mermaid 图表代码 |
| `format` | string | ❌ | `svg` | 输出格式: `svg`, `png`, `pdf` |
| `theme` | string | ❌ | `default` | 主题: `default`, `forest`, `dark`, `neutral` |
| `backgroundColor` | string | ❌ | `white` | 背景颜色 |
| `scale` | number | ❌ | `1` | 清晰度倍数 (1-10)，推荐 `2` 获得高清图片 |
| `return` | string | ❌ | `binary` | 返回格式: `binary`, `base64`, `url` |
| `urlType` | string | ❌ | 全局配置 | URL 类型: `internal`(内网), `external`(外网) |
| `expires` | number | ❌ | `0` | 签名URL有效期（秒），0表示永久URL |

> **关于 `scale` 参数**：
> - `scale=1`：标准清晰度（默认）
> - `scale=2`：2倍清晰度，输出图片物理尺寸翻倍（推荐，适合高 DPI 屏幕）
> - `scale=3`：3倍清晰度，输出图片物理尺寸为原来的 3 倍
> - `scale=4-10`：更高清晰度（用于打印等场景）
> 
> **尺寸限制**：如果 scale 导致输出超过 MAX_WIDTH/MAX_HEIGHT（默认 10000×10000），会自动降低 scale
> 
> 示例：图表原始尺寸 400×300，设置 `scale=2` 后输出图片为 **800×600** 像素

#### 返回格式说明

| return | 说明 | 适用场景 |
|--------|------|----------|
| `binary` | 直接返回图片二进制数据 | 下载文件、直接展示 |
| `base64` | 返回 JSON 包含 Base64 编码 | 前端内嵌、数据传输 |
| `url` | 上传到 COS 并返回访问 URL | 长期存储、CDN 分发 |

---

#### 示例 1：生成 SVG 并下载

```bash
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[开始] --> B{条件判断}\n    B -->|是| C[执行A]\n    B -->|否| D[执行B]\n    C --> E[结束]\n    D --> E",
    "format": "svg",
    "theme": "default"
  }' \
  -o flowchart.svg
```

**响应**：直接返回 SVG 文件内容
- Content-Type: `image/svg+xml`

---

#### 示例 2：生成 PNG 并获取 Base64

```bash
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "sequenceDiagram\n    Alice->>Bob: Hello!\n    Bob-->>Alice: Hi!",
    "format": "png",
    "return": "base64"
  }'
```

**响应**：

```json
{
  "code": 200,
  "message": "",
  "data": {
    "format": "png",
    "contentType": "image/png",
    "dataUrlPrefix": "data:image/png;base64,",
    "base64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "cached": false
  }
}
```

---

#### 示例 3：上传到 COS 获取 URL

```bash
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pie title 数据分布\n    \"A\" : 40\n    \"B\" : 30\n    \"C\" : 30",
    "format": "png",
    "return": "url"
  }'
```

**响应**：

```json
{
  "code": 200,
  "message": "",
  "data": {
    "format": "png",
    "contentType": "image/png",
    "url": "https://bucket.cos-internal.ap-guangzhou.tencentcos.cn/mermaid/a1b2/a1b2c3d4...md5.png",
    "key": "mermaid/a1b2/a1b2c3d4...md5.png",
    "cached": true,
    "cacheSource": "cos"
  }
}
```

**返回字段说明**：

| 字段 | 说明 |
|------|------|
| `url` | COS 访问 URL |
| `key` | COS 对象路径 |
| `cached` | 是否命中缓存（相同内容不会重复渲染） |
| `cacheSource` | 缓存来源: `cos`(COS已存在), `local`(本地缓存) |
| `expiresAt` | 签名URL过期时间戳（仅当 expires > 0 时返回） |

---

#### 示例 4：指定返回外网 URL

```bash
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A --> B --> C",
    "format": "png",
    "return": "url",
    "urlType": "external"
  }'
```

**响应**：

```json
{
  "code": 200,
  "message": "",
  "data": {
    "format": "png",
    "contentType": "image/png",
    "url": "https://bucket.cos.ap-guangzhou.tencentcos.cn/mermaid/xxxx/xxxx.png",
    "key": "mermaid/xxxx/xxxx.png",
    "cached": false
  }
}
```

---

#### 示例 5：获取带有效期的签名 URL

```bash
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A --> B --> C",
    "format": "png",
    "return": "url",
    "expires": 3600
  }'
```

**响应**：

```json
{
  "code": 200,
  "message": "",
  "data": {
    "format": "png",
    "contentType": "image/png",
    "url": "https://bucket.cos.ap-guangzhou.tencentcos.cn/mermaid/xxxx/xxxx.png?sign=xxx&x-cos-security-token=xxx",
    "key": "mermaid/xxxx/xxxx.png",
    "cached": false,
    "expiresAt": 1709876543
  }
}
```

---

#### 示例 6：生成 PDF 文档

```bash
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "sequenceDiagram\n    Alice->>Bob: Hello!\n    Bob-->>Alice: Hi!",
    "format": "pdf"
  }' \
  -o sequence.pdf
```

**响应**：直接返回 PDF 文件
- Content-Type: `application/pdf`
```

---

#### 示例 7：生成高清 PNG（使用 scale 参数）

```bash
# 生成 2x 高清图片
curl -X POST http://localhost:3000/api/mermaid/generate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[开始] --> B{条件}\n    B -->|是| C[执行]\n    B -->|否| D[跳过]\n    C --> E[结束]\n    D --> E",
    "format": "png",
    "scale": 2
  }' \
  -o chart-2x.png
```

**scale 参数效果**：图片清晰度和物理尺寸都会翻倍

| scale 值 | 效果 | 适用场景 |
|----------|------|----------|
| `1` (默认) | 标准清晰度 | 普通网页展示 |
| `2` (推荐) | 2x 高清，尺寸翻倍 | 高 DPI 屏幕、需要清晰图片 |
| `3` | 3x 超清，尺寸 3 倍 | 打印、高精度需求 |
| `4-10` | 更高清晰度 | 超大图打印、特殊需求 |

> **注意**：如果输出尺寸超过 MAX_WIDTH/MAX_HEIGHT（默认 10000×10000），scale 会自动降低

**示例**：图表原始尺寸 400×300
- `scale=1` → 输出 400×300 像素
- `scale=2` → 输出 **800×600** 像素（2x 高清）
- `scale=3` → 输出 **1200×900** 像素（3x 超清）
- `scale=10` → 输出 **4000×3000** 像素（如未超限）

---

### 3. 兼容接口（mermaid.ink 格式）

提供与 [mermaid.ink](https://mermaid.ink) 兼容的 URL 格式，方便迁移。

#### GET /img/:code

返回 PNG 图片。

```http
GET /img/{base64_encoded_code}?theme=default&return=binary
```

#### GET /svg/:code

返回 SVG 图片。

```http
GET /svg/{base64_encoded_code}?theme=default&return=binary
```

#### GET /pdf/:code

返回 PDF 文档。

```http
GET /pdf/{base64_encoded_code}?theme=default&return=binary
```

#### URL 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | string | `png` | 图片类型 (仅 /img 有效) |
| `theme` | string | `default` | 主题 |
| `bgColor` | string | - | 背景色 (如 `FF0000` 或 `!white`) |
| `scale` | number | 1 | 清晰度倍数 (1-10)，推荐 2 获得高清图片（超限自动调整） |
| `return` | string | `binary` | 返回格式: `binary`, `base64`, `url` |
| `urlType` | string | - | URL 类型: `internal`, `external` |
| `expires` | number | `0` | 签名URL有效期（秒），0表示永久URL |

#### 编码方式

代码需要使用 Base64 编码（支持 URL-safe 格式），可选使用 pako 压缩。

**方式 1：纯 Base64**

```bash
# 编码
echo -n 'graph LR\n    A-->B-->C' | base64
# Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw==

# 请求
curl "http://localhost:3000/img/Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw" -o diagram.png
```

**方式 2：Pako 压缩 + Base64**

与 mermaid.live 编辑器导出的格式兼容。支持两种格式：

```bash
# 方式 2a: 显式 pako: 前缀 (mermaid.ink 标准格式)
curl "http://localhost:3000/img/pako:eNpNkM9qwzAMh19F6NRB8wI5DN..." -o diagram.png

# 方式 2b: 自动检测 (0x78 字节头)
curl "http://localhost:3000/img/eNpNkM9qwzAMh19F6NRB8wI5DN..." -o diagram.png
```

JavaScript 编码示例：

```javascript
const pako = require('pako');

const code = 'graph TD\n    A-->B';
const compressed = pako.deflate(JSON.stringify({ code }), { level: 9 });
const encoded = Buffer.from(compressed).toString('base64url');

// 请求: GET /img/pako:{encoded}  或  GET /img/{encoded}
```

#### 兼容接口示例

```bash
# 生成 PNG (纯 Base64)
curl "http://localhost:3000/img/Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw?theme=dark" -o dark.png

# 生成 PNG (pako: 前缀，mermaid.ink 标准格式)
curl "http://localhost:3000/img/pako:eNpNkM9qwzAMh19F6NRB8wI5DN..." -o diagram.png

# 生成 SVG 并上传到 COS
curl "http://localhost:3000/svg/Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw?return=url"

# 指定背景色和尺寸
curl "http://localhost:3000/img/Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw?bgColor=!transparent&width=800&scale=2"
```

---

## 缓存机制

服务实现了**两级缓存**，大幅提升重复请求的响应速度：

### 缓存流程

```
请求 → 计算 cacheKey (基于 code+format+theme+width+height+bgColor)
    ↓
[return=url?] → 检查 COS 是否存在 → 存在 → 直接返回 URL (~30ms)
    ↓                                ↓
[检查本地缓存]  ← ← ← ← ← ← ← ←  不存在
    ↓ 命中                            ↓ 未命中
读取本地文件                      渲染图片 (~2s)
    ↓                                 ↓
上传 COS → 返回 URL           保存本地 → 上传 COS → 返回 URL
```

### 性能对比

| 场景 | 首次请求 | 重复请求 | 提升 |
|------|----------|----------|------|
| return=url | ~2.5s | ~30ms | **80x** |
| return=base64 | ~2s | ~50ms (本地缓存) | **40x** |
| return=binary | ~2s | ~50ms (本地缓存) | **40x** |

### 缓存配置

通过环境变量配置缓存行为：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CACHE_ENABLED` | `true` | 是否启用本地缓存 |
| `CACHE_DIR` | `/tmp/mermaid-cache` | 缓存目录 |
| `CACHE_MAX_AGE` | `86400` | 缓存过期时间（秒） |

---

## 环境变量

### 基础配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务监听端口 |
| `NODE_ENV` | - | 运行环境 (production/development) |

### 渲染配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `USE_BROWSER_POOL` | `true` | 是否启用浏览器池模式（推荐生产环境启用，性能提升 5-10 倍） |
| `RENDER_TIMEOUT` | `30000` | 渲染超时时间（毫秒） |
| `MAX_WIDTH` | `10000` | 输出图片最大宽度（像素），超过会自动降低 scale |
| `MAX_HEIGHT` | `10000` | 输出图片最大高度（像素），超过会自动降低 scale |
| `MERMAID_CDN_URL` | - | Mermaid.js CDN 地址（不设置则使用内嵌本地文件，设置后强制使用 CDN） |
| `FONT_AWESOME_JS_URL` | - | Font Awesome JS 地址（不设置则使用内嵌本地文件，设置后强制使用 CDN） |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium-browser` | Chromium 可执行文件路径 |

> **资源加载策略**：默认使用内嵌的本地文件（无网络请求，性能最佳）。如需使用 CDN 版本（如需要更新版本），可设置对应的 URL 环境变量。
> 
> **Font Awesome 说明**：使用 JS 版本（SVG+JS）而非 CSS 版本，因为 JS 版本会将图标渲染为内联 SVG，不需要加载额外的字体文件。

### 浏览器池配置

启用 `USE_BROWSER_POOL=true` 后生效：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BROWSER_POOL_MAX_PAGES` | `4` | 浏览器池最大页面数（并发渲染数） |
| `BROWSER_POOL_PAGE_IDLE_TIMEOUT` | `60000` | 页面空闲超时时间（毫秒），超时后回收 |
| `BROWSER_POOL_HEALTH_CHECK_INTERVAL` | `30000` | 浏览器健康检查间隔（毫秒） |

### COS 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `COS_SECRET_ID` | - | 腾讯云 SecretId |
| `COS_SECRET_KEY` | - | 腾讯云 SecretKey |
| `COS_BUCKET` | - | COS 存储桶名称 (如 `my-bucket-1250000000`) |
| `COS_REGION` | - | COS 地域 (如 `ap-guangzhou`) |
| `COS_INTERNAL` | `false` | 是否使用内网上传/访问 |
| `COS_BASE_URL` | - | 自定义 CDN 域名 (覆盖默认 URL) |
| `COS_PATH_PREFIX` | `mermaid/` | COS 文件路径前缀 |
| `COS_DEFAULT_EXPIRES` | `0` | 默认签名 URL 有效期（秒），0 表示永久 URL |
| `COS_HEAD_TIMEOUT_MS` | `2000` | COS 检查文件存在超时（毫秒） |
| `COS_UPLOAD_TIMEOUT_MS` | `60000` | COS 上传超时（毫秒） |

### 缓存配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CACHE_ENABLED` | `true` | 是否启用本地缓存 |
| `CACHE_DIR` | `/tmp/mermaid-cache` | 缓存目录路径 |
| `CACHE_MAX_AGE` | `86400` | 缓存过期时间（秒） |

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误或 Mermaid 语法错误 |
| 404 | 接口不存在 |
| 500 | 服务器内部错误 / COS 上传失败 |
| 504 | 渲染超时（超过 30 秒） |

### 错误响应格式

```json
{
  "code": 400,
  "message": "Mermaid code is required",
  "data": null
}
```

### 常见错误

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `Mermaid code is required` | 缺少 code 参数 | 添加 code 字段 |
| `Invalid format` | format 参数不正确 | 使用 `svg` 或 `png` |
| `Invalid theme` | theme 参数不正确 | 使用有效主题名 |
| `COS is not configured` | 未配置 COS 但使用 return=url | 配置 COS 环境变量 |
| `Mermaid rendering failed` | Mermaid 语法错误 | 检查图表代码语法 |
| `Rendering timed out` | 图表过于复杂 | 简化图表或增加超时 |

---

## 支持的图表类型

- ✅ 流程图 (Flowchart)
- ✅ 时序图 (Sequence Diagram)
- ✅ 类图 (Class Diagram)
- ✅ 状态图 (State Diagram)
- ✅ 实体关系图 (ER Diagram)
- ✅ 甘特图 (Gantt Chart)
- ✅ 饼图 (Pie Chart)
- ✅ 用户旅程图 (User Journey)
- ✅ Git 图 (Git Graph)
- ✅ 思维导图 (Mindmap)
- ✅ 时间线 (Timeline)
- ✅ 更多... (参见 [Mermaid 文档](https://mermaid.js.org/))

---

## 运行测试

```bash
# 使用 Docker 运行完整测试
bash docker-test.sh

# 本地测试（需要先启动服务）
bash test.sh http://localhost:3000
```

---

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Express.js
- **语言**: TypeScript
- **渲染**: @mermaid-js/mermaid-cli (Puppeteer + Chromium)
- **存储**: 腾讯云 COS
- **容器化**: Docker (Alpine Linux)

---

## 部署建议

### 生产环境配置

```yaml
# docker-compose.yml 生产配置示例
services:
  mermaid-render:
    image: mermaid-render:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - COS_SECRET_ID=${COS_SECRET_ID}
      - COS_SECRET_KEY=${COS_SECRET_KEY}
      - COS_BUCKET=${COS_BUCKET}
      - COS_REGION=${COS_REGION}
      - COS_INTERNAL=true  # 内网部署时启用
      - CACHE_MAX_AGE=604800  # 缓存 7 天
    deploy:
      resources:
        limits:
          memory: 2G  # Chromium 需要较多内存
    # ⚠️ 关键：Chromium 需要这个配置
    security_opt:
      - seccomp:unconfined
```

### Kubernetes 部署

⚠️ **K8S 部署 Chromium/Puppeteer 有几个关键点必须注意**：

#### 1. `/dev/shm` 大小问题（最常见）

K8S 默认 `/dev/shm` 只有 64MB，Chromium 需要更多，否则会**卡住或崩溃**：

```yaml
volumes:
  - name: dshm
    emptyDir:
      medium: Memory
      sizeLimit: 256Mi  # 至少 256Mi
      
volumeMounts:
  - name: dshm
    mountPath: /dev/shm
```

#### 2. 资源配置

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "2000m"
    memory: "1Gi"
```

#### 3. 完整的 K8S 部署配置

参考 `k8s/deployment.yaml`：

```bash
# 部署
kubectl apply -f k8s/deployment.yaml

# 检查状态
kubectl get pods -l app=mermaid-render
kubectl logs -f deployment/mermaid-render
```

#### 4. 常见问题排查

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| 请求卡住/超时 | `/dev/shm` 太小 | 挂载 256Mi+ 的 tmpfs |
| OOMKilled | 内存不足 | 增加 memory limit 到 1Gi+ |
| Permission denied | 安全上下文 | 添加 `SYS_ADMIN` capability |
| 启动失败 | 缺少依赖 | 检查镜像是否包含 Chromium |

### 性能优化建议

1. **启用内网访问**：在腾讯云环境部署时，设置 `COS_INTERNAL=true` 减少网络延迟
2. **配置 CDN**：设置 `COS_BASE_URL` 为 CDN 域名，加速图片访问
3. **调整缓存时间**：根据业务需求设置 `CACHE_MAX_AGE`
4. **内存配置**：容器至少分配 1GB 内存，推荐 2GB
5. **多副本部署**：建议至少 2 个副本，避免单点故障
6. **启用 Browser Pool**：设置 `USE_BROWSER_POOL=true` 大幅提升性能（见下方说明）

### Browser Pool 优化（实验性）

默认情况下，每次渲染请求都会启动一个新的 Chromium 进程，存在较大的启动开销（1-3秒）。

启用 Browser Pool 后，会维护一个常驻的 Chromium 浏览器实例池：
- **首次渲染**：~2-3 秒（需要启动浏览器）
- **后续渲染**：~200-500ms（复用已有浏览器）
- **性能提升**：5-10 倍

#### 启用方式

```bash
# 环境变量
USE_BROWSER_POOL=true
```

#### 相关配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `USE_BROWSER_POOL` | `false` | 是否启用浏览器池 |
| `BROWSER_POOL_MAX_PAGES` | `4` | 最大并发页面数 |
| `BROWSER_POOL_PAGE_IDLE_TIMEOUT` | `60000` | 页面空闲超时（毫秒） |
| `BROWSER_POOL_HEALTH_CHECK_INTERVAL` | `30000` | 健康检查间隔（毫秒） |

#### 健康检查

启用 Browser Pool 后，`/health` 端点会返回池状态：

```json
{
  "status": "ok",
  "browserPool": {
    "browserConnected": true,
    "totalPages": 2,
    "activePages": 1
  }
}
```

#### 注意事项

- **实验性功能**：Browser Pool 模式目前为实验性功能，在高并发场景下可能存在稳定性问题
- **内存占用**：常驻浏览器会占用约 200-300MB 内存
- **推荐场景**：低并发、对延迟敏感的场景（如交互式生成）

---

## License

MIT
