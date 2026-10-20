#!/bin/sh
set -e

echo "[entrypoint] prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  # 这是演示站：种子数据是确定性的，重启即回到可演示状态。
  # seed 自身拒绝在 NODE_ENV=production 下运行，这里只对这一次命令降级环境，
  # 服务进程仍然是 production。
  echo "[entrypoint] seeding demo data"
  NODE_ENV=development ./node_modules/.bin/tsx prisma/seed.ts
else
  echo "[entrypoint] SEED_ON_START is not true, keep existing data"
fi

exec node dist/main.js
