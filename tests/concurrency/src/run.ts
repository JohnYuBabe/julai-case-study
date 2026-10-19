import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const serverDir = resolve(repoRoot, 'packages/server');
const distMain = resolve(serverDir, 'dist/main.js');

loadEnv({ path: resolve(serverDir, '.env') });

const PORT = Number(process.env.CONCURRENCY_PORT ?? 3032);
const BASE = `http://127.0.0.1:${PORT}/api`;
const prisma = new PrismaClient();

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const suffix = Date.now().toString(36);
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const now = Date.now();

const eventIds = {
  signup: `${suffix}-ev-signup`,
  waitlist: `${suffix}-ev-waitlist`,
  promotion: `${suffix}-ev-promo`,
  duplicate: `${suffix}-ev-duplicate`,
  cancelledRow: `${suffix}-ev-cancelled-row`,
};
const organizerId = `${suffix}-organizer`;

const userIds = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${suffix}-${prefix}${index + 1}`);

const signupUsers = userIds('s', 50);
const waitlistUsers = userIds('q', 50);
const waitlistOccupant = `${suffix}-q0`;
const confirmedUsers = userIds('c', 10);
const queuedUsers = userIds('p', 10);
const duplicateUser = `${suffix}-d1`;
const cancelledRowUser = `${suffix}-r1`;

async function call(
  method: 'POST' | 'DELETE',
  path: string,
  userId: string,
): Promise<ApiResult> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'x-demo-user-id': userId },
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

async function isHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(
  child: ChildProcess,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`服务进程提前退出（code ${child.exitCode}）`);
    }
    if (await isHealthy()) return;
    await delay(150);
  }
  throw new Error(`服务在 ${timeoutMs}ms 内没有就绪`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(3_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function report(
  title: string,
  rows: Array<[string, string | number | boolean]>,
): void {
  console.log(`\n${title}`);
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(22, ' ')} ${value}`);
  }
}

async function prepareData(): Promise<void> {
  const ids = [
    organizerId,
    waitlistOccupant,
    ...signupUsers,
    ...waitlistUsers,
    ...confirmedUsers,
    ...queuedUsers,
    duplicateUser,
    cancelledRowUser,
  ];
  await prisma.user.createMany({
    data: ids.map((id) => ({ id, name: id })),
  });

  const base = {
    organizerId,
    signupDeadline: new Date(now + day),
    startAt: new Date(now + 2 * day),
    endAt: new Date(now + 2 * day + 2 * hour),
    cancelledAt: null,
    cancelReason: null,
  };

  await prisma.event.createMany({
    data: [
      {
        ...base,
        id: eventIds.signup,
        title: '并发报名：50 人抢 20 个名额',
        capacity: 20,
      },
      {
        ...base,
        id: eventIds.waitlist,
        title: '并发候补：50 人排队',
        capacity: 1,
        confirmedCount: 1,
      },
      {
        ...base,
        id: eventIds.promotion,
        title: '并发取消：10 人同时取消',
        capacity: 10,
        confirmedCount: 10,
        waitlistCount: 10,
      },
      {
        ...base,
        id: eventIds.duplicate,
        title: '同一用户并发重复报名',
        capacity: 5,
      },
      {
        ...base,
        id: eventIds.cancelledRow,
        title: '已有 CANCELLED 行的用户并发报名',
        capacity: 5,
      },
    ],
  });

  await prisma.signup.createMany({
    data: [
      {
        id: randomUUID(),
        eventId: eventIds.waitlist,
        userId: waitlistOccupant,
        status: 'CONFIRMED',
      },
      {
        id: randomUUID(),
        eventId: eventIds.cancelledRow,
        userId: cancelledRowUser,
        status: 'CANCELLED' as const,
        waitlistSeq: null,
      },
      ...confirmedUsers.map((userId) => ({
        id: randomUUID(),
        eventId: eventIds.promotion,
        userId,
        status: 'CONFIRMED' as const,
        waitlistSeq: null,
      })),
      ...queuedUsers.map((userId, index) => ({
        id: randomUUID(),
        eventId: eventIds.promotion,
        userId,
        status: 'WAITLISTED' as const,
        waitlistSeq: index + 1,
      })),
    ],
  });
}

async function scenarioSignup(): Promise<void> {
  const results = await Promise.all(
    signupUsers.map((userId) =>
      call('POST', `/events/${eventIds.signup}/signup`, userId),
    ),
  );
  const created = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  const codes = new Set(
    rejected.map(
      (r) => (r.body.error as { code?: string } | undefined)?.code ?? 'UNKNOWN',
    ),
  );

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventIds.signup },
  });
  const confirmedRows = await prisma.signup.count({
    where: { eventId: eventIds.signup, status: 'CONFIRMED' },
  });

  report('场景 1 · 50 人同时抢 20 个名额', [
    ['201 Created', created.length],
    ['409 Conflict', rejected.length],
    ['409 错误码', [...codes].join(', ')],
    ['confirmed_count', event.confirmedCount],
    ['CONFIRMED 行数', confirmedRows],
  ]);

  assert.equal(created.length, 20, '应该刚好 20 个报名成功');
  assert.equal(rejected.length, 30, '其余 30 个应该被拒绝');
  assert.deepEqual([...codes], ['SEATS_EXHAUSTED']);
  assert.equal(event.confirmedCount, 20, '计数不能超过容量');
  assert.equal(confirmedRows, 20, '报名行数必须与计数一致');
}

async function scenarioDuplicateFresh(): Promise<void> {
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      call('POST', `/events/${eventIds.duplicate}/signup`, duplicateUser),
    ),
  );
  const created = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 409);
  const codes = new Set(
    rejected.map(
      (r) => (r.body.error as { code?: string } | undefined)?.code ?? 'UNKNOWN',
    ),
  );

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventIds.duplicate },
  });
  const confirmedRows = await prisma.signup.count({
    where: { eventId: eventIds.duplicate, status: 'CONFIRMED' },
  });

  report('场景 2 · 新用户同时点 10 次报名', [
    ['201 Created', created],
    ['409 Conflict', rejected.length],
    ['409 错误码', [...codes].join(', ')],
    ['confirmed_count', event.confirmedCount],
    ['CONFIRMED 行数', confirmedRows],
  ]);

  assert.equal(created, 1, '同一个用户只能成功一次');
  assert.equal(rejected.length, 9);
  assert.deepEqual([...codes], ['ALREADY_SIGNED_UP']);
  assert.equal(event.confirmedCount, 1, '失败的事务必须把 +1 一起回滚');
  assert.equal(confirmedRows, 1);
}

async function scenarioDuplicateAfterCancel(): Promise<void> {
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      call('POST', `/events/${eventIds.cancelledRow}/signup`, cancelledRowUser),
    ),
  );
  const created = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 409);
  const codes = new Set(
    rejected.map(
      (r) => (r.body.error as { code?: string } | undefined)?.code ?? 'UNKNOWN',
    ),
  );

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventIds.cancelledRow },
  });
  const confirmedRows = await prisma.signup.count({
    where: { eventId: eventIds.cancelledRow, status: 'CONFIRMED' },
  });

  report('场景 3 · 已有取消记录的用户同时点 10 次报名', [
    ['201 Created', created],
    ['409 Conflict', rejected.length],
    ['409 错误码', [...codes].join(', ')],
    ['confirmed_count', event.confirmedCount],
    ['CONFIRMED 行数', confirmedRows],
  ]);

  assert.equal(created, 1, '同一用户只能成功一次');
  assert.equal(rejected.length, 9);
  assert.deepEqual([...codes], ['ALREADY_SIGNED_UP']);
  assert.equal(
    event.confirmedCount,
    1,
    '已有 CANCELLED 行时 upsert 走 update，必须靠活动行锁挡住并发',
  );
  assert.equal(confirmedRows, 1);
}

async function scenarioWaitlist(): Promise<void> {
  const results = await Promise.all(
    waitlistUsers.map((userId) =>
      call('POST', `/events/${eventIds.waitlist}/waitlist`, userId),
    ),
  );
  const created = results.filter((r) => r.status === 201);
  const seqs = results
    .map((r) => r.body.waitlistSeq)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);
  const expected = Array.from({ length: 50 }, (_, index) => index + 1);

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventIds.waitlist },
  });
  const rows = await prisma.signup.findMany({
    where: { eventId: eventIds.waitlist, status: 'WAITLISTED' },
    select: { waitlistSeq: true },
    orderBy: { waitlistSeq: 'asc' },
  });
  const dbSeqs = rows
    .map((row) => row.waitlistSeq)
    .filter((value): value is number => typeof value === 'number');

  report('场景 4 · 50 人同时加入候补', [
    ['201 Created', created.length],
    ['序号范围', seqs.length > 0 ? `${seqs[0]} – ${seqs[seqs.length - 1]}` : '无'],
    ['响应序号连续且唯一', JSON.stringify(seqs) === JSON.stringify(expected)],
    ['数据库序号连续且唯一', JSON.stringify(dbSeqs) === JSON.stringify(expected)],
    ['waitlist_count', event.waitlistCount],
  ]);

  assert.equal(created.length, 50);
  assert.deepEqual(seqs, expected, '响应序号必须是 1–50，且不重复');
  assert.deepEqual(dbSeqs, expected, '落库序号必须是 1–50，且不重复');
  assert.equal(
    results.filter((r) => typeof r.body.waitlistSeq === 'number').length,
    50,
    '每个成功响应都要带票号',
  );
  assert.equal(event.waitlistCount, 50, '发号次数必须等于候补人数');
}

async function scenarioPromotion(): Promise<void> {
  // 只让前 3 个确认用户取消：如果转正不是按最早排队，断言会看到 4–10 号，
  // 而不是 1–3 号。
  const cancelling = confirmedUsers.slice(0, 3);
  const results = await Promise.all(
    cancelling.map((userId) =>
      call('DELETE', `/events/${eventIds.promotion}/signup`, userId),
    ),
  );

  const promotedSeqs = results
    .map(
      (r) =>
        (r.body.promotion as { waitlistSeq?: number } | null)?.waitlistSeq,
    )
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventIds.promotion },
  });
  const grouped = await prisma.signup.groupBy({
    by: ['status'],
    where: { eventId: eventIds.promotion },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(
    grouped.map((row) => [row.status, row._count._all]),
  );

  report('场景 5 · 3 人同时取消，10 人候补（应由最早 3 人转正）', [
    ['200 OK', results.filter((r) => r.status === 200).length],
    ['转正票号', promotedSeqs.join(', ')],
    ['confirmed_count', event.confirmedCount],
    ['CONFIRMED / WAITLISTED', `${counts.CONFIRMED ?? 0} / ${counts.WAITLISTED ?? 0}`],
    ['CANCELLED', counts.CANCELLED ?? 0],
  ]);

  assert.equal(results.filter((r) => r.status === 200).length, 3);
  assert.deepEqual(promotedSeqs, [1, 2, 3], '只能转正最早排队的 3 人');
  assert.equal(event.confirmedCount, 10, '有人转正时总数不变');
  assert.equal(counts.CONFIRMED, 10);
  assert.equal(counts.WAITLISTED ?? 0, 7);
  assert.equal(counts.CANCELLED, 3);
}

async function cleanup(): Promise<void> {
  await prisma.signup.deleteMany({
    where: { eventId: { in: Object.values(eventIds) } },
  });
  await prisma.event.deleteMany({
    where: { id: { in: Object.values(eventIds) } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: suffix } },
  });
}

async function main(): Promise<void> {
  // 每次都从源码重新构建，避免对着上一次的 dist 跑出假绿。
  execFileSync('pnpm', ['--filter', '@julai/server', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (!existsSync(distMain)) {
    throw new Error('构建结束后仍找不到 packages/server/dist/main.js');
  }

  if (await isHealthy()) {
    throw new Error(
      `端口 ${PORT} 已被其他进程占用，改用 CONCURRENCY_PORT=<空闲端口> 重跑`,
    );
  }

  let server: ChildProcess | null = null;
  let stderr = '';

  try {
    await prepareData();

    server = spawn(process.execPath, ['dist/main.js'], {
      cwd: serverDir,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    server.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    await waitForHealth(server);
    await scenarioSignup();
    await scenarioDuplicateFresh();
    await scenarioDuplicateAfterCancel();
    await scenarioWaitlist();
    await scenarioPromotion();

    console.log('\n全部通过：五个并发场景都没有超卖、重号或重复转正。');
  } catch (error) {
    if (stderr) console.error(`\n服务端输出：\n${stderr}`);
    throw error;
  } finally {
    if (server) await stopServer(server);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
