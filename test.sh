#!/bin/bash

# Mermaid Render API 测试脚本
# 使用方法: ./test.sh [服务地址]
# 默认服务地址: http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"
OUTPUT_DIR="./test-output"

# 记录总耗时
TOTAL_START=$(date +%s%3N)

echo "🧪 Mermaid Render API 测试"
echo "   服务地址: $BASE_URL"
echo ""

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 计时函数 - 返回毫秒
get_time_ms() {
    date +%s%3N
}

# 计算耗时并格式化输出
format_duration() {
    local ms=$1
    if [ "$ms" -lt 1000 ]; then
        echo "${ms}ms"
    else
        local sec=$((ms / 1000))
        local rem=$((ms % 1000))
        echo "${sec}.${rem}s"
    fi
}

# 测试 1: 健康检查
echo "📋 测试 1: 健康检查"
START=$(get_time_ms)
HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$HEALTH_RESPONSE" == *'"status":"ok"'* ]]; then
    echo "   ✅ 健康检查通过 [$(format_duration $DURATION)]"
else
    echo "   ❌ 健康检查失败: $HEALTH_RESPONSE [$(format_duration $DURATION)]"
    exit 1
fi
echo ""

# 测试 2: 生成 SVG 流程图
echo "📋 测试 2: 生成 SVG 流程图"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[开始] --> B{条件判断}\n    B -->|是| C[执行操作A]\n    B -->|否| D[执行操作B]\n    C --> E[结束]\n    D --> E",
    "format": "svg",
    "theme": "default"
  }' \
  -o "$OUTPUT_DIR/flowchart.svg"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/flowchart.svg" ]; then
    FIRST_CHAR=$(head -c 1 "$OUTPUT_DIR/flowchart.svg")
    if [[ "$FIRST_CHAR" == "<" ]]; then
        SIZE=$(wc -c < "$OUTPUT_DIR/flowchart.svg")
        echo "   ✅ 流程图生成成功: $SIZE bytes [$(format_duration $DURATION)]"
    else
        echo "   ❌ 流程图生成失败 (渲染错误) [$(format_duration $DURATION)]"
        cat "$OUTPUT_DIR/flowchart.svg" | head -c 200
    fi
else
    echo "   ❌ 流程图生成失败 (空响应) [$(format_duration $DURATION)]"
fi
echo ""

# 测试 3: 生成 PNG 时序图
echo "📋 测试 3: 生成 PNG 时序图"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "sequenceDiagram\n    participant C as 客户端\n    participant S as 服务器\n    participant D as 数据库\n    C->>S: 发送请求\n    S->>D: 查询数据\n    D-->>S: 返回结果\n    S-->>C: 响应数据",
    "format": "png",
    "theme": "forest"
  }' \
  -o "$OUTPUT_DIR/sequence.png"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/sequence.png" ]; then
    SIZE=$(wc -c < "$OUTPUT_DIR/sequence.png")
    echo "   ✅ 时序图生成成功: $SIZE bytes [$(format_duration $DURATION)]"
else
    echo "   ❌ 时序图生成失败 [$(format_duration $DURATION)]"
fi
echo ""

# 测试 4: 生成饼图 (dark 主题)
echo "📋 测试 4: 生成饼图 (dark 主题)"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pie title 项目时间分配\n    \"开发\" : 45\n    \"测试\" : 25\n    \"文档\" : 15\n    \"会议\" : 15",
    "format": "svg",
    "theme": "dark"
  }' \
  -o "$OUTPUT_DIR/pie-dark.svg"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/pie-dark.svg" ]; then
    SIZE=$(wc -c < "$OUTPUT_DIR/pie-dark.svg")
    echo "   ✅ 饼图生成成功: $SIZE bytes [$(format_duration $DURATION)]"
else
    echo "   ❌ 饼图生成失败 [$(format_duration $DURATION)]"
fi
echo ""

# 测试 5: 生成类图
echo "📋 测试 5: 生成类图"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "classDiagram\n    class Animal {\n        +String name\n        +int age\n        +makeSound()\n    }\n    class Dog {\n        +String breed\n        +bark()\n    }\n    class Cat {\n        +String color\n        +meow()\n    }\n    Animal <|-- Dog\n    Animal <|-- Cat",
    "format": "svg",
    "theme": "neutral"
  }' \
  -o "$OUTPUT_DIR/class.svg"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/class.svg" ]; then
    SIZE=$(wc -c < "$OUTPUT_DIR/class.svg")
    echo "   ✅ 类图生成成功: $SIZE bytes [$(format_duration $DURATION)]"
else
    echo "   ❌ 类图生成失败 [$(format_duration $DURATION)]"
fi
echo ""

# 测试 5.1: Font Awesome 图标支持 (SVG)
echo "📋 测试 5.1: Font Awesome 图标支持 (SVG)"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "flowchart TD\n    A[fa:fa-user 用户] --> B[fa:fa-server 服务器]\n    B --> C[fa:fa-database 数据库]\n    C --> D[fa:fa-cloud 云存储]\n    D --> E[fa:fa-check-circle 完成]",
    "format": "svg",
    "theme": "default"
  }' \
  -o "$OUTPUT_DIR/fontawesome.svg"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/fontawesome.svg" ]; then
    FIRST_CHAR=$(head -c 1 "$OUTPUT_DIR/fontawesome.svg")
    if [[ "$FIRST_CHAR" == "<" ]]; then
        # 检查 SVG 中是否包含 Font Awesome 相关内容
        if grep -q "fa-" "$OUTPUT_DIR/fontawesome.svg" 2>/dev/null; then
            SIZE=$(wc -c < "$OUTPUT_DIR/fontawesome.svg")
            echo "   ✅ Font Awesome 图标渲染成功: $SIZE bytes [$(format_duration $DURATION)]"
        else
            SIZE=$(wc -c < "$OUTPUT_DIR/fontawesome.svg")
            echo "   ⚠️  SVG 生成成功但未检测到图标标记: $SIZE bytes [$(format_duration $DURATION)]"
        fi
    else
        echo "   ❌ Font Awesome 图标渲染失败 (渲染错误) [$(format_duration $DURATION)]"
        cat "$OUTPUT_DIR/fontawesome.svg" | head -c 200
    fi
else
    echo "   ❌ Font Awesome 图标渲染失败 (空响应) [$(format_duration $DURATION)]"
fi
echo ""

# 测试 5.2: Font Awesome 图标支持 (PNG)
echo "📋 测试 5.2: Font Awesome 图标支持 (PNG)"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "flowchart LR\n    A[fa:fa-laptop 客户端] -->|fa:fa-paper-plane 请求| B[fa:fa-server API]\n    B -->|fa:fa-cogs 处理| C[fa:fa-database DB]\n    C -->|fa:fa-reply 响应| B\n    B -->|fa:fa-paper-plane 返回| A",
    "format": "png",
    "scale": 2
  }' \
  -o "$OUTPUT_DIR/fontawesome.png"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/fontawesome.png" ]; then
    # 检查是否为有效的 PNG 文件
    FILE_TYPE=$(file -b "$OUTPUT_DIR/fontawesome.png" 2>/dev/null | head -c 3)
    if [[ "$FILE_TYPE" == "PNG" ]]; then
        SIZE=$(wc -c < "$OUTPUT_DIR/fontawesome.png")
        echo "   ✅ Font Awesome PNG 生成成功: $SIZE bytes [$(format_duration $DURATION)]"
    else
        echo "   ❌ Font Awesome PNG 生成失败 (非PNG格式) [$(format_duration $DURATION)]"
        cat "$OUTPUT_DIR/fontawesome.png" | head -c 200
    fi
else
    echo "   ❌ Font Awesome PNG 生成失败 (空响应) [$(format_duration $DURATION)]"
fi
echo ""

# 测试 6: return=url - 上传到 COS (SVG)
echo "📋 测试 6: return=url - 上传到 COS (SVG)"
START=$(get_time_ms)
COS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[用户请求] --> B[API网关]\n    B --> C[Mermaid服务]\n    C --> D[渲染图片]\n    D --> E[上传COS]\n    E --> F[返回URL]",
    "format": "svg",
    "return": "url"
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COS_RESPONSE" == *'"code":200'* ]] && [[ "$COS_RESPONSE" == *'"url":'* ]]; then
    COS_URL=$(echo "$COS_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COS_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COS_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ COS上传成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ COS上传成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COS_URL"
else
    echo "   ⚠️  COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COS_RESPONSE"
fi
echo ""

# 测试 7: return=url - 上传 PNG 到 COS
echo "📋 测试 7: return=url - 上传到 COS (PNG)"
START=$(get_time_ms)
COS_PNG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "sequenceDiagram\n    Client->>Server: POST /generate\n    Server->>COS: Upload Image\n    COS-->>Server: Return URL\n    Server-->>Client: JSON Response",
    "format": "png",
    "return": "url"
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COS_PNG_RESPONSE" == *'"code":200'* ]] && [[ "$COS_PNG_RESPONSE" == *'"url":'* ]]; then
    COS_PNG_URL=$(echo "$COS_PNG_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COS_PNG_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COS_PNG_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ COS上传成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ COS上传成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COS_PNG_URL"
else
    echo "   ⚠️  COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COS_PNG_RESPONSE"
fi
echo ""

# 测试 8: return=url + urlType=internal - 返回内网URL
echo "📋 测试 8: return=url + urlType=internal - 返回内网URL"
START=$(get_time_ms)
COS_INTERNAL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[内网] --> B[测试]",
    "format": "png",
    "return": "url",
    "urlType": "internal"
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COS_INTERNAL_RESPONSE" == *'"code":200'* ]] && [[ "$COS_INTERNAL_RESPONSE" == *'cos-internal'* ]]; then
    COS_INTERNAL_URL=$(echo "$COS_INTERNAL_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COS_INTERNAL_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COS_INTERNAL_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ 内网URL返回成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ 内网URL返回成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COS_INTERNAL_URL"
elif [[ "$COS_INTERNAL_RESPONSE" == *'"code":200'* ]]; then
    COS_INTERNAL_URL=$(echo "$COS_INTERNAL_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    echo "   ⚠️  上传成功但URL不是内网格式 [$(format_duration $DURATION)]"
    echo "      URL: $COS_INTERNAL_URL"
else
    echo "   ⚠️  COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COS_INTERNAL_RESPONSE"
fi
echo ""

# 测试 9: return=url + urlType=external - 返回外网URL
echo "📋 测试 9: return=url + urlType=external - 返回外网URL"
START=$(get_time_ms)
COS_EXTERNAL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[外网] --> B[测试]",
    "format": "png",
    "return": "url",
    "urlType": "external"
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COS_EXTERNAL_RESPONSE" == *'"code":200'* ]] && [[ "$COS_EXTERNAL_RESPONSE" != *'cos-internal'* ]]; then
    COS_EXTERNAL_URL=$(echo "$COS_EXTERNAL_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COS_EXTERNAL_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COS_EXTERNAL_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ 外网URL返回成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ 外网URL返回成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COS_EXTERNAL_URL"
elif [[ "$COS_EXTERNAL_RESPONSE" == *'"code":200'* ]]; then
    COS_EXTERNAL_URL=$(echo "$COS_EXTERNAL_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    echo "   ⚠️  上传成功但URL格式异常 [$(format_duration $DURATION)]"
    echo "      URL: $COS_EXTERNAL_URL"
else
    echo "   ⚠️  COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COS_EXTERNAL_RESPONSE"
fi
echo ""

# 测试 10: return=base64 - 返回 base64 编码
echo "📋 测试 10: return=base64 - 返回 base64 编码"
START=$(get_time_ms)
BASE64_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pie title 数据分布\n    \"A\" : 40\n    \"B\" : 30\n    \"C\" : 30",
    "format": "png",
    "return": "base64"
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$BASE64_RESPONSE" == *'"code":200'* ]] && [[ "$BASE64_RESPONSE" == *'"base64":'* ]]; then
    DATA_LENGTH=$(echo "$BASE64_RESPONSE" | grep -o '"base64":"[^"]*"' | wc -c)
    echo "   ✅ Base64返回成功 (数据长度: $DATA_LENGTH 字符) [$(format_duration $DURATION)]"
else
    echo "   ❌ Base64返回失败 [$(format_duration $DURATION)]"
    echo "      $BASE64_RESPONSE"
fi
echo ""

# 测试 11: 兼容接口 + return=url
echo "📋 测试 11: 兼容接口 /img/:code + return=url"
COMPAT_CODE="Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw"
START=$(get_time_ms)
COMPAT_RESPONSE=$(curl -s "$BASE_URL/img/$COMPAT_CODE?return=url")
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COMPAT_RESPONSE" == *'"code":200'* ]] && [[ "$COMPAT_RESPONSE" == *'"url":'* ]]; then
    COMPAT_URL=$(echo "$COMPAT_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COMPAT_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COMPAT_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ 兼容接口COS上传成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ 兼容接口COS上传成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COMPAT_URL"
else
    echo "   ⚠️  兼容接口COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COMPAT_RESPONSE"
fi
echo ""

# 测试 12: 兼容接口 + urlType 参数
echo "📋 测试 12: 兼容接口 /img/:code + urlType=internal"
COMPAT_CODE="Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw"
START=$(get_time_ms)
COMPAT_INTERNAL_RESPONSE=$(curl -s "$BASE_URL/img/$COMPAT_CODE?return=url&urlType=internal")
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COMPAT_INTERNAL_RESPONSE" == *'"code":200'* ]] && [[ "$COMPAT_INTERNAL_RESPONSE" == *'cos-internal'* ]]; then
    COMPAT_INTERNAL_URL=$(echo "$COMPAT_INTERNAL_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COMPAT_INTERNAL_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COMPAT_INTERNAL_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ 兼容接口内网URL返回成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ 兼容接口内网URL返回成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COMPAT_INTERNAL_URL"
elif [[ "$COMPAT_INTERNAL_RESPONSE" == *'"code":200'* ]]; then
    COMPAT_INTERNAL_URL=$(echo "$COMPAT_INTERNAL_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    echo "   ⚠️  上传成功但URL不是内网格式 [$(format_duration $DURATION)]"
    echo "      URL: $COMPAT_INTERNAL_URL"
else
    echo "   ⚠️  兼容接口COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COMPAT_INTERNAL_RESPONSE"
fi
echo ""

# 测试 13: 缓存测试 - 相同内容第二次上传应命中缓存
echo "📋 测试 13: 缓存测试 - 相同内容应命中缓存"
# 第一次上传
START1=$(get_time_ms)
CACHE_RESPONSE1=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    CACHE[缓存测试] --> TEST[验证]",
    "format": "png",
    "return": "url"
  }')
END1=$(get_time_ms)
DURATION1=$((END1 - START1))

# 第二次上传相同内容
START2=$(get_time_ms)
CACHE_RESPONSE2=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    CACHE[缓存测试] --> TEST[验证]",
    "format": "png",
    "return": "url"
  }')
END2=$(get_time_ms)
DURATION2=$((END2 - START2))

if [[ "$CACHE_RESPONSE2" == *'"cached":true'* ]]; then
    CACHE_URL=$(echo "$CACHE_RESPONSE2" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHE_SOURCE=$(echo "$CACHE_RESPONSE2" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ 缓存命中成功 (source: $CACHE_SOURCE)"
    echo "      第一次: $(format_duration $DURATION1) (上传)"
    echo "      第二次: $(format_duration $DURATION2) (缓存命中)"
    echo "      URL: $CACHE_URL"
elif [[ "$CACHE_RESPONSE2" == *'"code":200'* ]]; then
    CACHED_VALUE=$(echo "$CACHE_RESPONSE2" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    echo "   ⚠️  上传成功但缓存未命中 (cached: $CACHED_VALUE)"
    echo "      第一次: $(format_duration $DURATION1)"
    echo "      第二次: $(format_duration $DURATION2)"
else
    echo "   ⚠️  COS上传失败或未配置"
    echo "      $CACHE_RESPONSE2"
fi
echo ""

# 测试 14: pako: 前缀兼容测试 (mermaid.ink 格式)
echo "📋 测试 14: 兼容接口 pako: 前缀 (mermaid.ink 格式)"
# 这是 mermaid.ink 官网的示例 URL 编码
PAKO_CODE="pako:eNpNkM9qwzAMh19F6NRB8wI5DNak7aWwwXqLexCxUpvNf3AURkny7rNbynaTPn0_ITRjHzRjjddE0cC5VR7grWtMsqM4Gi9QVa_LkQVc8HxbYLc5BhhNiNH660uxd0WBZj4ViUGM9V9rGTT37LvnBdruRFFCvPzx809YYN_ZD5MX_-cmcU4cuoHqgaqeEjSUsqBECW7RcXJkdT55LiGFYtixwjqXmgeavkWh8mtWp6hJeK-thIS1pIm3SJOEz5vvn_3DaS3lB7gHXH8BFrFcZw"
START=$(get_time_ms)
PAKO_RESPONSE=$(curl -s "$BASE_URL/img/$PAKO_CODE" -o "$OUTPUT_DIR/pako-test.png" -w "%{http_code}")
END=$(get_time_ms)
DURATION=$((END - START))

if [ "$PAKO_RESPONSE" == "200" ] && [ -f "$OUTPUT_DIR/pako-test.png" ]; then
    SIZE=$(stat -c%s "$OUTPUT_DIR/pako-test.png" 2>/dev/null || stat -f%z "$OUTPUT_DIR/pako-test.png" 2>/dev/null)
    FILE_TYPE=$(file "$OUTPUT_DIR/pako-test.png" | grep -o 'PNG\|image')
    if [ -n "$FILE_TYPE" ]; then
        echo "   ✅ pako:前缀解析成功 ($SIZE bytes) [$(format_duration $DURATION)]"
        echo "      文件: $OUTPUT_DIR/pako-test.png"
    else
        echo "   ❌ pako:前缀解析失败 - 返回的不是图片"
        head -c 200 "$OUTPUT_DIR/pako-test.png"
    fi
else
    echo "   ❌ pako:前缀解析失败 (HTTP $PAKO_RESPONSE) [$(format_duration $DURATION)]"
fi
echo ""

# 测试 15: 错误处理 - 缺少 code 参数
echo "📋 测试 15: 错误处理 - 缺少 code 参数"
START=$(get_time_ms)
ERROR_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{"format": "svg"}')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$ERROR_RESPONSE" == *'"Mermaid code is required"'* ]]; then
    echo "   ✅ 错误处理正确: 返回了预期的错误信息 [$(format_duration $DURATION)]"
else
    echo "   ⚠️  错误响应 [$(format_duration $DURATION)]"
    echo "      $ERROR_RESPONSE"
fi
echo ""

# 测试 16: 生成 PDF 文件
echo "📋 测试 16: 生成 PDF 文件"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[开始] --> B[处理]\n    B --> C[结束]",
    "format": "pdf",
    "theme": "default"
  }' \
  -o "$OUTPUT_DIR/flowchart.pdf"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/flowchart.pdf" ]; then
    FILE_TYPE=$(file "$OUTPUT_DIR/flowchart.pdf" | grep -o 'PDF')
    if [ "$FILE_TYPE" == "PDF" ]; then
        SIZE=$(wc -c < "$OUTPUT_DIR/flowchart.pdf")
        echo "   ✅ PDF生成成功: $SIZE bytes [$(format_duration $DURATION)]"
    else
        echo "   ❌ PDF生成失败 (返回的不是PDF格式) [$(format_duration $DURATION)]"
        head -c 200 "$OUTPUT_DIR/flowchart.pdf"
    fi
else
    echo "   ❌ PDF生成失败 (空响应) [$(format_duration $DURATION)]"
fi
echo ""

# 测试 17: return=url - 上传 PDF 到 COS
echo "📋 测试 17: return=url - 上传 PDF 到 COS"
START=$(get_time_ms)
COS_PDF_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "sequenceDiagram\n    Client->>Server: Request PDF\n    Server-->>Client: Return PDF",
    "format": "pdf",
    "return": "url"
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COS_PDF_RESPONSE" == *'"code":200'* ]] && [[ "$COS_PDF_RESPONSE" == *'"url":'* ]]; then
    COS_PDF_URL=$(echo "$COS_PDF_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    CACHED=$(echo "$COS_PDF_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    CACHE_SOURCE=$(echo "$COS_PDF_RESPONSE" | grep -o '"cacheSource":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$CACHE_SOURCE" ]; then
        echo "   ✅ PDF COS上传成功 (cached: $CACHED, source: $CACHE_SOURCE) [$(format_duration $DURATION)]"
    else
        echo "   ✅ PDF COS上传成功 (cached: $CACHED) [$(format_duration $DURATION)]"
    fi
    echo "      URL: $COS_PDF_URL"
else
    echo "   ⚠️  PDF COS上传失败或未配置 [$(format_duration $DURATION)]"
    echo "      $COS_PDF_RESPONSE"
fi
echo ""

# 测试 18: return=url + expires - 签名URL有效期
echo "📋 测试 18: return=url + expires - 签名URL有效期"
START=$(get_time_ms)
EXPIRES_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[签名URL] --> B[有效期测试]",
    "format": "png",
    "return": "url",
    "expires": 3600
  }')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$EXPIRES_RESPONSE" == *'"code":200'* ]] && [[ "$EXPIRES_RESPONSE" == *'"url":'* ]]; then
    EXPIRES_URL=$(echo "$EXPIRES_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    EXPIRES_AT=$(echo "$EXPIRES_RESPONSE" | grep -o '"expiresAt":[0-9]*' | cut -d':' -f2)
    CACHED=$(echo "$EXPIRES_RESPONSE" | grep -o '"cached":[^,}]*' | cut -d':' -f2)
    
    # 检查是否是签名URL (包含 sign 或 q-signature 参数)
    if [[ "$EXPIRES_URL" == *'sign='* ]] || [[ "$EXPIRES_URL" == *'q-signature='* ]]; then
        echo "   ✅ 签名URL生成成功 (cached: $CACHED) [$(format_duration $DURATION)]"
        if [ -n "$EXPIRES_AT" ]; then
            EXPIRES_DATE=$(date -d "@$EXPIRES_AT" 2>/dev/null || date -r "$EXPIRES_AT" 2>/dev/null || echo "未知")
            echo "      过期时间: $EXPIRES_DATE (timestamp: $EXPIRES_AT)"
        fi
        echo "      URL: ${EXPIRES_URL:0:100}..."
    else
        echo "   ⚠️  上传成功但URL不是签名格式 [$(format_duration $DURATION)]"
        echo "      URL: $EXPIRES_URL"
    fi
else
    echo "   ⚠️  签名URL测试失败或COS未配置 [$(format_duration $DURATION)]"
    echo "      $EXPIRES_RESPONSE"
fi
echo ""

# 测试 19: 兼容接口 /pdf/:code - 直接返回PDF
echo "📋 测试 19: 兼容接口 /pdf/:code - 直接返回PDF"
PDF_CODE="Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw"
START=$(get_time_ms)
PDF_COMPAT_RESPONSE=$(curl -s "$BASE_URL/pdf/$PDF_CODE" -o "$OUTPUT_DIR/compat-test.pdf" -w "%{http_code}")
END=$(get_time_ms)
DURATION=$((END - START))

if [ "$PDF_COMPAT_RESPONSE" == "200" ] && [ -f "$OUTPUT_DIR/compat-test.pdf" ]; then
    FILE_TYPE=$(file "$OUTPUT_DIR/compat-test.pdf" | grep -o 'PDF')
    if [ "$FILE_TYPE" == "PDF" ]; then
        SIZE=$(stat -c%s "$OUTPUT_DIR/compat-test.pdf" 2>/dev/null || stat -f%z "$OUTPUT_DIR/compat-test.pdf" 2>/dev/null)
        echo "   ✅ 兼容接口PDF生成成功 ($SIZE bytes) [$(format_duration $DURATION)]"
        echo "      文件: $OUTPUT_DIR/compat-test.pdf"
    else
        echo "   ❌ 兼容接口PDF生成失败 - 返回的不是PDF"
        head -c 200 "$OUTPUT_DIR/compat-test.pdf"
    fi
else
    echo "   ❌ 兼容接口PDF生成失败 (HTTP $PDF_COMPAT_RESPONSE) [$(format_duration $DURATION)]"
fi
echo ""

# 测试 20: 兼容接口 /img/:code + expires - 签名URL
echo "📋 测试 20: 兼容接口 /img/:code + expires - 签名URL"
COMPAT_CODE="Z3JhcGggTFIKICAgIEEtLT5CLS0+Qw"
START=$(get_time_ms)
COMPAT_EXPIRES_RESPONSE=$(curl -s "$BASE_URL/img/$COMPAT_CODE?return=url&expires=7200")
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$COMPAT_EXPIRES_RESPONSE" == *'"code":200'* ]] && [[ "$COMPAT_EXPIRES_RESPONSE" == *'"url":'* ]]; then
    COMPAT_EXPIRES_URL=$(echo "$COMPAT_EXPIRES_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    EXPIRES_AT=$(echo "$COMPAT_EXPIRES_RESPONSE" | grep -o '"expiresAt":[0-9]*' | cut -d':' -f2)
    
    if [[ "$COMPAT_EXPIRES_URL" == *'sign='* ]] || [[ "$COMPAT_EXPIRES_URL" == *'q-signature='* ]]; then
        echo "   ✅ 兼容接口签名URL成功 [$(format_duration $DURATION)]"
        if [ -n "$EXPIRES_AT" ]; then
            echo "      过期时间戳: $EXPIRES_AT"
        fi
        echo "      URL: ${COMPAT_EXPIRES_URL:0:100}..."
    else
        echo "   ⚠️  上传成功但URL不是签名格式 [$(format_duration $DURATION)]"
        echo "      URL: $COMPAT_EXPIRES_URL"
    fi
else
    echo "   ⚠️  兼容接口签名URL测试失败或COS未配置 [$(format_duration $DURATION)]"
    echo "      $COMPAT_EXPIRES_RESPONSE"
fi
echo ""

# 测试 21: 错误处理 - 无效的 format
echo "📋 测试 21: 错误处理 - 无效的 format"
START=$(get_time_ms)
ERROR_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{"code": "graph TD\n    A-->B", "format": "gif"}')
END=$(get_time_ms)
DURATION=$((END - START))

if [[ "$ERROR_RESPONSE" == *'Invalid format'* ]]; then
    echo "   ✅ 错误处理正确: 返回了预期的错误信息 [$(format_duration $DURATION)]"
else
    echo "   ⚠️  错误响应 [$(format_duration $DURATION)]"
    echo "      $ERROR_RESPONSE"
fi
echo ""

# 测试 22: 高清图片 - scale=2
echo "📋 测试 22: 高清图片 - scale=2 (2x 清晰度)"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[开始] --> B{条件判断}\n    B -->|是| C[执行操作A]\n    B -->|否| D[执行操作B]\n    C --> E[结束]\n    D --> E",
    "format": "png",
    "scale": 2
  }' \
  -o "$OUTPUT_DIR/scale-2x.png"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/scale-2x.png" ]; then
    SIZE=$(wc -c < "$OUTPUT_DIR/scale-2x.png")
    if command -v identify &> /dev/null; then
        DIMENSIONS=$(identify -format "%wx%h" "$OUTPUT_DIR/scale-2x.png" 2>/dev/null)
        echo "   ✅ 2x 高清图片生成成功: $SIZE bytes, 尺寸: $DIMENSIONS [$(format_duration $DURATION)]"
    else
        echo "   ✅ 2x 高清图片生成成功: $SIZE bytes [$(format_duration $DURATION)]"
    fi
else
    echo "   ❌ 高清图片生成失败 [$(format_duration $DURATION)]"
fi
echo ""

# 测试 23: 对比测试 - scale=1 vs scale=2
echo "📋 测试 23: 对比测试 - scale=1 vs scale=2"
# scale=1 (默认)
START1=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[Scale对比] --> B[测试]",
    "format": "png",
    "scale": 1
  }' \
  -o "$OUTPUT_DIR/compare-1x.png"
END1=$(get_time_ms)
DURATION1=$((END1 - START1))

# scale=2
START2=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[Scale对比] --> B[测试]",
    "format": "png",
    "scale": 2
  }' \
  -o "$OUTPUT_DIR/compare-2x.png"
END2=$(get_time_ms)
DURATION2=$((END2 - START2))

if [ -s "$OUTPUT_DIR/compare-1x.png" ] && [ -s "$OUTPUT_DIR/compare-2x.png" ]; then
    SIZE1=$(wc -c < "$OUTPUT_DIR/compare-1x.png")
    SIZE2=$(wc -c < "$OUTPUT_DIR/compare-2x.png")
    echo "   ✅ 对比测试完成"
    echo "      scale=1: $SIZE1 bytes [$(format_duration $DURATION1)]"
    echo "      scale=2: $SIZE2 bytes [$(format_duration $DURATION2)]"
    
    if command -v identify &> /dev/null; then
        DIM1=$(identify -format "%wx%h" "$OUTPUT_DIR/compare-1x.png" 2>/dev/null)
        DIM2=$(identify -format "%wx%h" "$OUTPUT_DIR/compare-2x.png" 2>/dev/null)
        echo "      scale=1 尺寸: $DIM1"
        echo "      scale=2 尺寸: $DIM2 (应为 scale=1 的 2 倍)"
        
        # 验证尺寸是否翻倍
        W1=$(echo "$DIM1" | cut -d'x' -f1)
        W2=$(echo "$DIM2" | cut -d'x' -f1)
        EXPECTED=$((W1 * 2))
        if [ "$W2" -eq "$EXPECTED" ]; then
            echo "      ✅ 尺寸验证通过: $W1 × 2 = $W2"
        else
            echo "      ⚠️  尺寸验证: 预期 $EXPECTED，实际 $W2"
        fi
    fi
else
    echo "   ❌ 对比测试失败"
fi
echo ""

# 测试 24: 超清图片 - scale=3
echo "📋 测试 24: 超清图片 - scale=3 (3x 清晰度)"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[Scale对比] --> B[测试]",
    "format": "png",
    "scale": 3
  }' \
  -o "$OUTPUT_DIR/compare-3x.png"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/compare-3x.png" ]; then
    SIZE=$(wc -c < "$OUTPUT_DIR/compare-3x.png")
    if command -v identify &> /dev/null; then
        DIM3=$(identify -format "%wx%h" "$OUTPUT_DIR/compare-3x.png" 2>/dev/null)
        # 与 1x 对比
        if [ -s "$OUTPUT_DIR/compare-1x.png" ]; then
            DIM1=$(identify -format "%wx%h" "$OUTPUT_DIR/compare-1x.png" 2>/dev/null)
            W1=$(echo "$DIM1" | cut -d'x' -f1)
            W3=$(echo "$DIM3" | cut -d'x' -f1)
            EXPECTED=$((W1 * 3))
            echo "   ✅ 3x 超清图片生成成功: $SIZE bytes, 尺寸: $DIM3 [$(format_duration $DURATION)]"
            if [ "$W3" -eq "$EXPECTED" ]; then
                echo "      ✅ 尺寸验证通过: $W1 × 3 = $W3"
            else
                echo "      ⚠️  尺寸验证: 预期 $EXPECTED，实际 $W3"
            fi
        else
            echo "   ✅ 3x 超清图片生成成功: $SIZE bytes, 尺寸: $DIM3 [$(format_duration $DURATION)]"
        fi
    else
        echo "   ✅ 3x 超清图片生成成功: $SIZE bytes [$(format_duration $DURATION)]"
    fi
else
    echo "   ❌ 超清图片生成失败 [$(format_duration $DURATION)]"
fi
echo ""

# 测试 25: Scale 越界测试 - scale=10 (应自动调整)
echo "📋 测试 25: Scale 越界测试 - scale=10 (验证自动调整)"
START=$(get_time_ms)
curl -s -X POST "$BASE_URL/api/mermaid/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph LR\n    A[Scale越界测试] --> B[应自动调整]",
    "format": "png",
    "scale": 10
  }' \
  -o "$OUTPUT_DIR/compare-10x.png"
END=$(get_time_ms)
DURATION=$((END - START))

if [ -s "$OUTPUT_DIR/compare-10x.png" ]; then
    SIZE=$(wc -c < "$OUTPUT_DIR/compare-10x.png")
    if command -v identify &> /dev/null; then
        DIM10=$(identify -format "%wx%h" "$OUTPUT_DIR/compare-10x.png" 2>/dev/null)
        W10=$(echo "$DIM10" | cut -d'x' -f1)
        H10=$(echo "$DIM10" | cut -d'x' -f2)
        # 检查是否超过默认最大尺寸 10000x10000
        if [ "$W10" -le 10000 ] && [ "$H10" -le 10000 ]; then
            echo "   ✅ scale=10 图片生成成功: $SIZE bytes, 尺寸: $DIM10 [$(format_duration $DURATION)]"
            echo "      ✅ 尺寸在限制范围内 (≤10000x10000)"
            # 与 1x 对比计算实际 scale
            if [ -s "$OUTPUT_DIR/compare-1x.png" ]; then
                DIM1=$(identify -format "%wx%h" "$OUTPUT_DIR/compare-1x.png" 2>/dev/null)
                W1=$(echo "$DIM1" | cut -d'x' -f1)
                ACTUAL_SCALE=$((W10 / W1))
                echo "      📊 实际 scale: $ACTUAL_SCALE (请求: 10，可能因尺寸限制自动调整)"
            fi
        else
            echo "   ⚠️  尺寸超过限制: $DIM10 (最大 10000x10000)"
        fi
    else
        echo "   ✅ scale=10 图片生成成功: $SIZE bytes [$(format_duration $DURATION)]"
    fi
else
    echo "   ❌ scale=10 图片生成失败 [$(format_duration $DURATION)]"
fi
echo ""

# 计算总耗时
TOTAL_END=$(date +%s%3N)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

# 汇总结果
echo "========================================"
echo "📊 测试完成！"
echo "   总耗时: $(format_duration $TOTAL_DURATION)"
echo "   输出目录: $OUTPUT_DIR"
echo ""
echo "   生成的文件:"
ls -la "$OUTPUT_DIR" 2>/dev/null | grep -E '\.(svg|png|pdf)$' | awk '{print "   - " $NF " (" $5 " bytes)"}'
echo ""
echo "   你可以使用浏览器或图片查看器打开这些文件查看效果。"
