#!/bin/sh
# 构建子路径版本的前端。VITE_API_BASE 必须在这里固定，
# 否则直接跑 pnpm build 会把 /api 打进 bundle，线上所有请求都会 404。
set -e
cd "$(dirname "$0")/.."
VITE_API_BASE=/julai/api pnpm --filter @julai/web-demo build
echo "built packages/web-demo/dist with VITE_API_BASE=/julai/api"
