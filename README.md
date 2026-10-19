# julai-case-study

A runnable slice of three engineering decisions from a real product: oversell prevention, derived event status, and a single source of truth for UI state.

> **This is a case study, not the full product.** All data is synthetic.

## Three decisions

1. **No oversell**: every write path first takes `SELECT ... FOR UPDATE` on the event row, then increments with a conditional `UPDATE ... WHERE confirmed_count < capacity`. A unique constraint backs duplicate signups. No Redis pre-allocation, no unlocked read-then-write.
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

The organizer only manages. Write endpoints reject the organizer with
`ORGANIZER_CANNOT_PARTICIPATE`, so the button (`MANAGE`) and the API cannot
drift apart. Waitlist labels show the live queue position, not the
non-recycled ticket number stored for FIFO promotion.

## Status

- ✅ `packages/shared` — types, `deriveEventStatus`, `resolveButtonState`, 9-state contract tests.
- ✅ `packages/server` — NestJS + Prisma + MySQL, signup / waitlist / cancel / auto-promotion, 32 smoke tests.
- ✅ `tests/concurrency` — 5 scenarios against a real server process and MySQL.
- ✅ `packages/web-demo` — Vue 3 + Vite. Event list, detail page, and a live 9-state matrix that renders whatever the server returns.
- ⏳ ADRs, deployment.

## Concurrency evidence

All five scenarios run against a freshly built server and a real MySQL 8 instance:

| Scenario | Expected | Observed |
| --- | --- | --- |
| 50 users race for 20 seats | exactly 20 succeed | 20 × 201, 30 × 409 `SEATS_EXHAUSTED`, `confirmed_count = 20` |
| one new user taps signup 10 times | one signup | 1 × 201, 9 × 409 `ALREADY_SIGNED_UP`, `confirmed_count = 1` |
| a user with a `CANCELLED` row taps 10 times | one signup | 1 × 201, 9 × 409, `confirmed_count = 1` |
| 50 users join the waitlist | unique sequential numbers | 50 × 201, rows persisted with sequence exactly 1–50 |
| 3 confirmed cancel with 10 waiting | the earliest 3 promoted | promotions 1, 2, 3; `confirmed_count` stays 10 |

Two failure modes shaped the design:

- **Deadlock.** An early version added `NOT EXISTS (SELECT ... FROM signups)` to
  the seat `UPDATE`. Under 50 concurrent requests the subquery took gap locks on
  the signups index and InnoDB deadlocked; only 5 of 20 seats were sold. Every
  write path now locks the event row first, and the seat `UPDATE` touches only
  that row.
- **Ghost seats.** Relying on `UNIQUE(event_id, user_id)` alone is not enough:
  after a cancellation the row stays as `CANCELLED`, so a re-signup takes the
  upsert's `update` branch instead of hitting the constraint. Ten concurrent
  retries each added one to `confirmed_count` without a matching confirmed row.
  The status check now happens under the same event-row lock as the increment.

## Develop

Requires Node 22 and Docker (or any MySQL 8 on `127.0.0.1:3311`).

```bash
# 1. MySQL
docker run -d --name julai-case-mysql -p 127.0.0.1:3311:3306 \
  -e MYSQL_ROOT_PASSWORD=change-me \
  -e MYSQL_DATABASE=julai_case mysql:8.0

# 2. Install, migrate, seed
pnpm install
cp packages/server/.env.example packages/server/.env   # adjust the password
pnpm --filter @julai/server prisma:deploy
pnpm --filter @julai/server prisma:seed

# 3. Tests
pnpm test                                  # 41 shared + 32 server
pnpm --filter @julai/server build
pnpm --filter @julai/concurrency start     # rebuilds, then starts the server on :3032

# 4. Run locally
pnpm --filter @julai/server start          # http://127.0.0.1:3030/api/health

# 5. Web demo (separate terminal; Vite proxies /api to :3030)
pnpm --filter @julai/web-demo dev          # http://127.0.0.1:5176
```

The web demo picks an identity from the header (guest, ten members, or the
organizer) and renders the server's `ButtonView` verbatim. The **9 态矩阵** page
fetches nine fixed fixtures and shows the actual button next to each contract
state, so a mismatch is visible rather than hidden.

For a deployment under a subpath, build with the API prefix baked in:

```bash
VITE_API_BASE=/julai/api pnpm --filter @julai/web-demo build
```

The prefix must be stripped by the reverse proxy, because Nest serves `/api`,
not `/julai/api`. With nginx:

```nginx
location /julai/ {
  alias /srv/julai/dist/;
  try_files $uri $uri/ /julai/index.html;
}
location /julai/api/ {
  proxy_pass http://127.0.0.1:3030/api/;   # trailing slash strips /julai
  proxy_set_header Host $host;
}
```

Identity in the demo is explicit: send `x-demo-user-id: u-1` (or any seeded
user). A real product would read this from the session. The demo server binds
to `127.0.0.1` by default; set `HOST=0.0.0.0` only when deploying behind a
reverse proxy.

The smoke suite reseeds the same database the demo server uses, so point
`DATABASE_URL` at a disposable MySQL instance. `seed` refuses to run when
`NODE_ENV=production`.

## License

MIT. See [LICENSE](./LICENSE).
