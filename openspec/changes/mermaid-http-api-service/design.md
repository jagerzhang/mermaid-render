## Context

这是一个全新的项目，用于提供 Mermaid 图表渲染的 HTTP API 服务。当前工作区是空项目，需要从零搭建完整的 Node.js 后端服务。

**约束条件：**
- Puppeteer 需要 Chromium 浏览器环境
- Docker 镜像需要包含 Chromium 依赖
- 需要处理并发请求时的浏览器实例管理

## Goals / Non-Goals

**Goals:**
- 提供稳定可靠的 Mermaid 渲染 API
- 支持 SVG 和 PNG 两种输出格式
- 支持多种 Mermaid 主题
- 提供容器化部署方案
- 保持代码简洁，易于维护

**Non-Goals:**
- 不实现用户认证和授权（可后续扩展）
- 不实现请求限流（可后续扩展）
- 不实现图表缓存机制（可后续扩展）
- 不支持 PDF、JPEG 等其他格式（MVP 阶段）

## Decisions

### 1. 项目结构

```
mermaid-render/
├── src/
│   ├── index.ts              # 入口文件
│   ├── routes/
│   │   └── mermaid.ts        # Mermaid API 路由
│   └── services/
│       └── mermaid.ts        # Mermaid 渲染服务
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

**理由：** 采用标准的 Express.js 项目结构，分离路由和业务逻辑，便于维护和扩展。

### 2. 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js 18 LTS | 稳定、长期支持 |
| 语言 | TypeScript | 类型安全，提高代码质量 |
| Web 框架 | Express.js | 成熟稳定，生态丰富 |
| 图表渲染 | @mermaid-js/mermaid-cli | 官方 CLI 工具，稳定可靠 |
| 容器基础镜像 | node:18-slim + Puppeteer 依赖 | 平衡镜像大小和功能完整性 |

### 3. 渲染方案

**选择：使用 @mermaid-js/mermaid-cli (mmdc) 命令行工具**

**理由：**
- 官方维护，API 稳定
- 内置 Puppeteer 集成，无需手动管理浏览器
- 支持 SVG、PNG 输出
- 支持主题配置

**替代方案对比：**
- 直接使用 mermaid + puppeteer：需要手动管理浏览器实例，复杂度高
- 使用 mermaid-server 等现成方案：学习成本低但不够灵活

### 4. API 设计

```
POST /api/mermaid/generate
Content-Type: application/json

Request Body:
{
  "code": "graph TD\n  A --> B",  // 必填，Mermaid 代码
  "format": "svg",                  // 可选，svg|png，默认 svg
  "theme": "default",               // 可选，default|forest|dark|neutral
  "width": 800,                     // 可选，输出宽度
  "height": 600,                    // 可选，输出高度
  "backgroundColor": "white"        // 可选，背景色
}

Response:
- Content-Type: image/svg+xml 或 image/png
- Body: 图片二进制数据
```

### 5. Docker 部署策略

**多阶段构建：**
1. 构建阶段：安装依赖、编译 TypeScript
2. 运行阶段：仅包含运行时依赖和编译产物

**Puppeteer/Chromium 处理：**
- 使用 `puppeteer` 包自带的 Chromium
- 安装必要的系统依赖（字体、图形库等）
- 配置 Puppeteer 以无沙箱模式运行（容器内必需）

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| Puppeteer/Chromium 导致镜像体积大（~1GB） | 接受，可后续研究更轻量方案 |
| 并发渲染可能消耗大量内存 | 暂不处理，MVP 阶段可接受 |
| Mermaid 代码错误导致渲染失败 | 捕获异常，返回友好错误信息 |
| 长时间渲染任务可能超时 | 设置合理的超时时间（30秒） |

## Open Questions

1. ~~是否需要支持 Docker 部署？~~ 已确认需要支持
2. 后续是否需要添加认证机制？（暂定不需要）
3. 是否需要添加请求限流？（暂定不需要）
