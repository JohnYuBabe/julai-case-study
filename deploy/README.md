# 部署

线上地址：<https://johnyu.wancafu.com/julai/>

## 组成

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| 前端静态文件 | 服务器 `/var/www/julai` | `packages/web-demo/dist` 的内容，不是整个仓库 |
| NestJS | 容器 `julai-server`，宿主 `127.0.0.1:3030` | 只绑回环，由宿主 nginx 反代 |
| MySQL 8 | 容器 `julai-mysql`，宿主 `127.0.0.1:3311` | 应用账号 `julai`，不是 root |
| 定时重置 | 容器 `julai-resetter` | 每 6 小时重跑 seed，见下 |

## 首次部署

```bash
# 1. 同步源码（不要同步 node_modules / dist / .env）
rsync -az --exclude node_modules --exclude dist --exclude .env \
  ./ user@host:/opt/julai-case-study/

# 2. 生成部署密钥
cd /opt/julai-case-study/deploy
cp .env.example .env
# 把两个 change-me 换成 openssl rand -hex 24 的输出；chmod 600 .env

# 3. 构建并启动
docker compose build server
docker compose up -d

# 4. 前端：在本地或 CI 构建后只上传 dist
./deploy/build-web.sh
rsync -az --delete packages/web-demo/dist/ user@host:/var/www/julai/

# 5. nginx
#    把 deploy/nginx-locations.conf 的内容合并进 johnyu.wancafu.com 的 443 server 块；
#    limit_req_zone / map 放在文件顶部（http 上下文），location 放在
#    `location / { return 404; }` 之前。然后：
nginx -t && nginx -s reload

# 6. 验证
curl -fsS https://johnyu.wancafu.com/julai/healthz
curl -fsS -o /dev/null -w '%{http_code}\n' https://johnyu.wancafu.com/julai/
curl -fsS -o /dev/null -w '%{http_code}\n' https://johnyu.wancafu.com/julai/.env   # 期望 404
```

> 宝塔面板在保存站点设置、切换 SSL 等操作时可能重写 vhost，把手工合并的
> `/julai` 片段冲掉。改完面板设置后重新检查线上 200 与 `nginx -t`；vhost 的
> 备份文件名为 `*.bak.julai-<时间戳>`。本次上线用的是
> `/tmp/julai-nginx-patch.py`（一次性脚本，未入库）。

## 为什么每 6 小时重置

种子数据的时间全部相对于 seed 时刻生成：报名截止、开赛、结束都是偏移量。
不重置的话，几天后所有活动都会变成「已结束」，9 态矩阵和候补转正演示都会失效。
`julai-resetter` 每 6 小时执行一次 `tsx prisma/seed.ts`，把数据拉回可演示状态。
公开写接口也会修改种子状态（演示身份就是请求头），重置同时覆盖这一点。

重置是「删一批 + 建一批」，不是事务，期间可能有 1–2 秒读到空列表；对演示站可以接受。
要保留访客改动时，把 compose 里 `SEED_ON_START` 设为 `false` 并停掉 resetter。

## 更新

```bash
rsync ... ./ user@host:/opt/julai-case-study/
cd /opt/julai-case-study/deploy && docker compose build server && docker compose up -d
# 前端有改动时重新 build-web.sh 并 rsync dist
```

`docker compose up -d` 会重建 server 容器；入口脚本先跑 `prisma migrate deploy`，
再按 `SEED_ON_START` 决定是否 seed。
