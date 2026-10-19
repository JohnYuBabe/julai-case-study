# 架构

这是一个可运行的切片，不是完整产品。它把真实产品里最容易出错的三件事抽出来，
用最小的代码量做对：**不超卖、状态不腐坏、按钮不漂移**。

## 组件

```text
┌──────────────────────────┐        ┌──────────────────────────┐
│ packages/web-demo        │  HTTP  │ packages/server          │
│ Vue 3 + Vite             │ ─────► │ NestJS 11                │
│ 列表 / 详情 / 9 态矩阵    │        │ 事件、报名、候补、转正    │
│ 只渲染 ButtonView        │ ◄───── │ 事务 + 行锁              │
└──────────────────────────┘        └───────────┬──────────────┘
                                                │ Prisma
                                    ┌───────────▼──────────────┐
                                    │ MySQL 8 (InnoDB)         │
                                    │ events / signups / users │
                                    └──────────────────────────┘
                       ▲
                       │ 同一份类型与纯函数
              ┌────────┴─────────┐
              │ packages/shared  │
              │ 9 态契约 + 推导  │
              └──────────────────┘

tests/concurrency ── 启动真实 server 进程 ── 真实 MySQL
```

| 包 | 职责 | 不做什么 |
| --- | --- | --- |
| `packages/shared` | 按钮状态契约、时间阶段推导、9 态元数据 | 不碰 I/O、不读时钟 |
| `packages/server` | 接口、事务、名额与候补、错误码 | 不做展示样式 |
| `packages/web-demo` | 列表、详情、身份切换、9 态矩阵 | 不做任何状态判断 |
| `tests/concurrency` | 并发正确性的可重复证据 | 不 mock 数据库 |

## 数据模型

```prisma
User    id, name
Event   id, title, capacity, confirmedCount, waitlistCount,
        signupDeadline, startAt, endAt,
        cancelledAt, cancelReason, organizerId
Signup  id, eventId, userId, status, waitlistSeq, ...
```

约束：

- `UNIQUE(event_id, user_id)`：一个人对一场活动只有一行报名记录。
- `UNIQUE(event_id, waitlist_seq)`：候补票号不重复。
- `CHECK capacity > 0`、`confirmed_count BETWEEN 0 AND capacity`、`waitlist_count >= 0`。
- `CHECK signup_deadline <= start_at < end_at`。
- `CHECK (status = 'WAITLISTED') = (waitlist_seq IS NOT NULL AND waitlist_seq > 0)`。
- 取消活动时必须带原因；报名行级联删除，用户不可删除。

`waitlist_count` 是**发号器**，只增不减；`waitlist_seq` 是**票号**，退出后不回收。
两者都不表示「当前排队人数」。当前排位在读取时统计：
`COUNT(WAITLISTED WHERE waitlist_seq <= 我的票号)`。

## 接口

所有接口前缀 `/api`。演示身份从请求头 `x-demo-user-id` 读取；真实产品应从会话读取。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 进程与数据库健康检查 |
| GET | `/events` | 列表；`status` 读取时推导 |
| GET | `/events/:id` | 详情；含 `viewer`、`registration`、`button` |
| POST | `/events/:id/signup` | 报名；201 |
| POST | `/events/:id/waitlist` | 加入候补；201，返回票号 |
| DELETE | `/events/:id/signup` | 取消报名；可能触发自动转正 |
| DELETE | `/events/:id/waitlist` | 退出候补 |

错误统一为 `{ "error": { "code": "...", "message": "..." } }`，客户端只认 `code`：

`AUTH_REQUIRED`、`INVALID_DEMO_USER`、`EVENT_NOT_FOUND`、`EVENT_CANCELLED`、
`SIGNUP_CLOSED`、`SEATS_EXHAUSTED`、`SEATS_AVAILABLE`、`ALREADY_SIGNED_UP`、
`ALREADY_WAITLISTED`、`NOT_SIGNED_UP`、`NOT_WAITLISTED`、
`ORGANIZER_CANNOT_PARTICIPATE`。

## 写入路径

所有写操作都在一个事务里完成，顺序固定：

```text
BEGIN
  SELECT ... FROM events WHERE id = ? FOR UPDATE   -- 活动行锁
  校验：队长 / 取消 / 截止 / 开赛 / 报名状态
  UPDATE events ... WHERE confirmed_count < capacity  (报名)
  UPSERT signups ...
COMMIT
```

取消报名时，同一事务内：

1. 把取消者的行改为 `CANCELLED`，清空 `waitlist_seq`。
2. 找 `WAITLISTED` 中票号最小（其次 `created_at` 最早）的一行。
3. 有候补：改为 `CONFIRMED`，`confirmed_count` 不变；无候补：`confirmed_count - 1`。

锁顺序始终是 events → signups。理由、失败模式与证据见
[ADR 0002](decisions/0002-seat-allocation-row-lock.md)。

## 状态与按钮

- 活动阶段：`CANCELLED > FINISHED > ONGOING > CLOSED > OPEN`，读取时推导。
- 按钮状态：9 种，服务端用共享纯函数一次判定，前端只渲染。
- 队长不参与报名：`MANAGE` 按钮与 `ORGANIZER_CANNOT_PARTICIPATE` 一一对应。

详见 [ADR 0001](decisions/0001-event-status-derived-not-stored.md) 与
[ADR 0003](decisions/0003-single-source-of-ui-state.md)。

## 测试策略

| 层 | 位置 | 覆盖 |
| --- | --- | --- |
| 契约单测 | `packages/shared/test` | 9 态可达、优先级、三处时间边界 ±1ms、元数据穷尽（41 例） |
| 接口冒烟 | `packages/server/test` | 列表 5 阶段、身份、报名/取消、候补、转正、错误码、413（32 例） |
| 并发 | `tests/concurrency` | 5 个真实并发场景；每次先重建 server，避免旧产物假绿 |
| 前端 | 手工 + 9 态矩阵页 | 每一态由真实接口驱动；与契约不一致时显式标红 |

冒烟测试会重置同一个数据库，因此 `DATABASE_URL` 必须指向可丢弃的实例；`seed`
在 `NODE_ENV=production` 时拒绝运行。

## 部署约束

- 服务默认监听 `127.0.0.1`；放到反向代理后面时显式设置 `HOST=0.0.0.0`。
- 前端构建用相对路径（`base: './'`），可以挂在任意子路径；API 前缀用
  `VITE_API_BASE` 指定，例如 `/julai/api`。
- 演示身份来自请求头，**不能直接暴露到公网**而不加限制；真实产品必须换成会话。
- 种子数据全部为合成数据，不包含任何客户、雇主或涉密信息。

## 已知边界

- 没有登录、注册、真实用户体系；身份是显式请求头。
- 没有分页、搜索、管理端、通知、支付。
- 名额只能通过种子设置，没有运营侧修改接口。
- 未实现锁超时重试；极端锁等待会返回 500。
- 单 MySQL 实例，未讨论只读副本与跨库一致性。
