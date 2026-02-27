## Why

当前需要一个后端服务来将 Mermaid 代码转换为可视化图表图片。虽然 Mermaid.js 是前端库，但很多场景需要在服务端生成图表：批量处理、集成到不支持 JavaScript 的环境、构建通用图表服务等。通过 HTTP API 提供 Mermaid 渲染能力，可以让任何应用通过简单的 HTTP 请求生成精美图表。

## What Changes

- 新建完整的 Node.js + Express.js 后端项目
- 实现 Mermaid 代码到 SVG/PNG 图片的转换服务
- 提供 RESTful API 接口供外部调用
- 支持多种图表主题配置
- 支持自定义输出尺寸
- 提供 Docker 容器化部署方案
- 提供健康检查和基础监控能力

## Capabilities

### New Capabilities

- `mermaid-render`: 核心渲染服务，接收 Mermaid 代码并生成 SVG 或 PNG 格式的图表图片
- `http-api`: RESTful API 层，提供 POST /api/mermaid/generate 接口，支持格式、主题、尺寸等参数配置
- `docker-deploy`: Docker 容器化支持，包含 Dockerfile、docker-compose 配置，支持一键构建和部署

### Modified Capabilities

（无，这是全新项目）

## Impact

### 技术栈
- **运行时**: Node.js v16+
- **框架**: Express.js
- **核心依赖**: mermaid、puppeteer
- **容器化**: Docker、docker-compose

### API 接口
- `POST /api/mermaid/generate` - 生成图表
  - 输入: `{ code, format?, theme?, width?, height? }`
  - 输出: 图片二进制数据 (SVG/PNG)

### 部署方式
- 直接运行: `npm start`
- Docker 部署: `docker-compose up -d`

### 资源需求
- Puppeteer 需要 Chromium，Docker 镜像会较大（约 1GB+）
- 建议内存 >= 512MB
