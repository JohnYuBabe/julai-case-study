# ADR 0002：活动行锁 + 条件更新，精确控制名额

- 状态：已采纳
- 日期：2026-10-19

## 背景

报名是一个「读容量、判断、写计数」的复合动作。50 个人同时点报名时，如果先读
`confirmed_count` 再写回，两个请求会读到同一个旧值，各自 +1，最终卖出超过容量的
名额。候选方案有 Redis 预扣、应用层互斥锁、数据库条件更新、乐观版本号等。

同时还有第二个陷阱：用户取消后记录不能删除（需要保留历史，也要让唯一约束继续
挡住重复报名），于是一行 `CANCELLED` 会留下来。此时再报名走的是 upsert 的
`update` 分支，不会触发 `UNIQUE(event_id, user_id)`，只靠唯一约束挡不住并发重报。

## 决策

所有写路径（报名、加入候补、取消报名、退出候补）都按同一顺序执行：

1. 开启事务。
2. `SELECT ... FROM events WHERE id = ? FOR UPDATE` 锁住活动行。
3. 在锁内读取报名记录、判断活动状态与报名状态。
4. 报名时执行条件更新：
   `UPDATE events SET confirmed_count = confirmed_count + 1
    WHERE id = ? AND confirmed_count < capacity AND cancelled_at IS NULL AND signup_deadline > ?`
   并检查影响行数。
5. 写 `signups` 行（upsert）。
6. 提交事务。

`UNIQUE(event_id, user_id)` 保留为最后一道兜底，但不再承担并发正确性。

锁顺序固定为 **events → signups**，所有写路径一致，避免交叉等待。

## 为什么不是「一条原子 UPDATE 就够了」

最初的实现把重复报名判断塞进容量更新：

```sql
UPDATE events
SET confirmed_count = confirmed_count + 1
WHERE id = ?
  AND confirmed_count < capacity
  AND NOT EXISTS (SELECT 1 FROM signups WHERE ...)
```

50 并发下 InnoDB 对 `signups` 索引取 gap lock，与其它事务互相等待，触发死锁回滚
（错误 1213）。结果只有 5 个名额卖出，其余 45 个请求全部失败。事件行锁把竞争
集中到一行，子查询不再需要，死锁消失。

## 证据

`tests/concurrency` 对真实 MySQL 8 运行五个场景：

| 场景 | 结果 |
| --- | --- |
| 50 人抢 20 个名额 | 20 × 201，30 × 409 `SEATS_EXHAUSTED`，计数与行数都是 20 |
| 新用户同时点 10 次 | 1 × 201，9 × 409 `ALREADY_SIGNED_UP`，计数为 1 |
| 已有 `CANCELLED` 行再点 10 次 | 1 × 201，9 × 409，计数为 1（幽灵占位回归） |
| 50 人加入候补 | 响应与数据库序号都恰好是 1–50 |
| 3 人同时取消、10 人候补 | 转正第 1、2、3 位，确认人数保持 10 |

## 后果

- 同一场活动的写操作串行化。事务很短，容量本身就是串行瓶颈，吞吐足够；不同活动
  之间互不影响。
- 依赖数据库行锁；MySQL 的隔离级别与锁行为是实现的一部分，已用真实数据库验证，
  不能只靠内存 mock。
- 极端锁等待会触发 `innodb_lock_wait_timeout`，表现为 500；本案例未做重试。真实
  产品可以在事务外层对死锁/超时做有限重试。
- 计数与报名行在同一事务里，任何一个失败都会一起回滚，不会留下幽灵名额。

## 备选方案

- **Redis 预扣**：多一个必须与数据库保持一致的组件，补偿逻辑复杂。
- **应用层互斥锁**：多实例失效，重启丢锁。
- **乐观版本号**：需要客户端重试，冲突率高时体验差。
- **只靠唯一约束**：挡不住取消后重报的 upsert 分支，已在并发场景 3 复现。
