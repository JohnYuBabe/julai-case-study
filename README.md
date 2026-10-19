# julai-case-study

A runnable slice of three engineering decisions from a real product: oversell prevention, derived event status, and a single source of truth for UI state.

> **This is a case study, not the full product.** All data is synthetic.

## Three decisions

1. **No oversell**: a single conditional `UPDATE ... WHERE confirmed_count < capacity` plus a unique constraint, instead of read-then-write or a Redis pre-allocation.
2. **Status is never stored**: the event's time phase is derived from `now` on every read. No cron job, no state column to go stale.
3. **UI state is resolved once**: the shared package defines the 9 button states; the server resolves them and sends the whole view. The web client only renders.

## The nine button states

| # | State | Condition | Label |
| --- | --- | --- | --- |
| 1 | `CANCELLED` | the event was cancelled | 活动已取消 |
| 2 | `FINISHED` | `now >= endAt` | 活动已结束 |
| 3 | `MANAGE` | viewer is the organizer | 管理本期活动 |
| 4 | `SIGNED_UP` | viewer has a confirmed signup; cancellable before start | 已报名 · 取消报名 |
| 5 | `WAITLISTED` | viewer is on the waitlist; can leave before start | 候补中 · 第 N 位 |
| 6 | `CLOSED` | not signed up, and signup closed or the event started | 报名已截止 / 比赛已开始 |
| 7 | `JOIN_WAITLIST` | full, no signup yet | 加入候补（第 N 位） |
| 8 | `SIGNUP_GUEST` | seats available, visitor not logged in | 立即报名 |
| 9 | `SIGNUP` | seats available, logged in | 立即报名 |

Precedence: cancelled > finished > organizer > signed up > waitlisted > started > deadline > full > open.

## Status

- ✅ `packages/shared` — types, `deriveEventStatus`, `resolveButtonState`, 9-state contract tests.
- ⏳ `packages/server` — NestJS + Prisma + MySQL.
- ⏳ `packages/web-demo` — Vue 3 + Vite.
- ⏳ concurrency test, ADRs, deployment.

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
```

## License

MIT. See [LICENSE](./LICENSE).
