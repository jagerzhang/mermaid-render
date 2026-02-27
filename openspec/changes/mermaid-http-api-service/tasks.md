## 1. 项目初始化

- [x] 1.1 创建 package.json 和安装依赖（express, typescript, @mermaid-js/mermaid-cli, puppeteer 等）
- [x] 1.2 创建 tsconfig.json 配置 TypeScript 编译选项
- [x] 1.3 创建项目目录结构（src/routes, src/services）

## 2. 核心渲染服务

- [x] 2.1 实现 src/services/mermaid.ts - Mermaid 渲染服务，支持 SVG/PNG 输出、主题配置、尺寸配置
- [x] 2.2 实现错误处理和超时控制逻辑

## 3. HTTP API 层

- [x] 3.1 实现 src/routes/mermaid.ts - POST /api/mermaid/generate 路由，包含参数验证
- [x] 3.2 实现 src/index.ts - Express 应用入口，包含中间件配置和健康检查端点

## 4. Docker 部署

- [x] 4.1 创建 Dockerfile - 多阶段构建，包含 Puppeteer/Chromium 依赖
- [x] 4.2 创建 docker-compose.yml - 服务编排配置
- [x] 4.3 创建 .dockerignore - 排除不必要的文件

## 5. 文档和收尾

- [x] 5.1 更新 README.md - 项目说明、API 文档、部署指南
