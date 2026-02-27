# Single stage build to minimize complexity
FROM node:18-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk \
    # 额外的依赖，确保 Chromium 稳定运行
    dumb-init \
    && rm -rf /var/cache/apk/*

# Set Puppeteer to use system Chromium with no-sandbox for Docker/K8S
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser
# Required for running Chromium in Docker/K8S without --privileged
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

# 优化 Node.js 内存和垃圾回收
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# Copy all source files first
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install dependencies and build in one step
# Using --ignore-scripts to prevent any postinstall scripts that might spawn threads
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --ignore-scripts && \
    npm run build && \
    npm prune --production

# Create non-root user and necessary directories
RUN addgroup -S mermaid && adduser -S mermaid -G mermaid && \
    # 创建缓存目录并设置权限
    mkdir -p /tmp/mermaid-cache && \
    chown -R mermaid:mermaid /app /tmp/mermaid-cache && \
    # 确保 /tmp 对所有用户可写（Chromium 临时目录会在这里创建）
    chmod 1777 /tmp

# Switch to non-root user
USER mermaid

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 使用 dumb-init 作为 PID 1，正确处理信号和僵尸进程
# 这对于运行 Chromium 子进程非常重要
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
