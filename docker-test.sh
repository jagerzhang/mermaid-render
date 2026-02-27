#!/bin/bash

# Docker 构建和测试脚本
# 在 Docker 环境中测试 Mermaid Render API

set -e

echo "🐳 Mermaid Render API - Docker 测试"
echo ""

# 步骤 1: 构建 Docker 镜像
echo "📦 步骤 1: 构建 Docker 镜像..."
docker build -t mermaid-render:test . 2>&1 | tail -20

echo ""
echo "✅ 镜像构建完成"
echo ""

# 步骤 2: 启动容器
echo "🚀 步骤 2: 启动服务容器..."
docker rm -f mermaid-render-test 2>/dev/null || true
docker run -d --name mermaid-render-test -p 3001:3000 \
    --env-file .env \
    mermaid-render:test

# 等待服务启动
echo "   等待服务启动..."
sleep 5

# 步骤 3: 运行测试
echo ""
echo "🧪 步骤 3: 运行测试..."
echo ""

./test.sh http://localhost:3001

# 步骤 4: 清理
echo ""
echo "🧹 步骤 4: 清理测试容器..."
docker stop mermaid-render-test
docker rm mermaid-render-test

echo ""
echo "✅ Docker 测试完成！"
