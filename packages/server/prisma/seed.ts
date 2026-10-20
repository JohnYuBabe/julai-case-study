import { PrismaClient, type SignupStatus } from '@prisma/client';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 演示数据：每个时间阶段至少一个活动，另加一个「候补转正」专用活动。
 *
 * 所有时间都相对 `now` 生成，任何时候跑起来都能看到完整的 9 种状态。
 * 数据全部是合成的，不含任何真实活动或用户。
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed 会清空数据，禁止在 production 环境运行');
  }

  const now = Date.now();
  const at = (offset: number) => new Date(now + offset);

  // 外键顺序：先删报名，再删活动，最后删用户。
  await prisma.signup.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: 'u-organizer', name: '队长' },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `u-${i + 1}`,
        name: `队员 ${i + 1}`,
      })),
      // 状态矩阵专用探针：不出现在 web-demo 的身份切换器里，
      // 避免其他页面的操作把这些夹具改掉。
      { id: 'u-probe-member', name: '演示队员' },
      { id: 'u-probe-signed', name: '演示队员（已报名）' },
      { id: 'u-probe-confirmed', name: '演示队员（占位）' },
      { id: 'u-probe-queued', name: '演示队员（候补）' },
    ],
  });

  const eventBase = {
    organizerId: 'u-organizer',
    signupDeadline: at(2 * DAY),
    startAt: at(3 * DAY),
    endAt: at(3 * DAY + 2 * HOUR),
    confirmedCount: 0,
    waitlistCount: 0,
    cancelledAt: null,
    cancelReason: null,
  };

  await prisma.event.createMany({
    data: [
      {
        ...eventBase,
        id: 'ev-open',
        title: '周五晚篮球 · 开放报名',
        capacity: 20,
      },
      {
        ...eventBase,
        id: 'ev-full',
        title: '周六晚篮球 · 已满可候补',
        capacity: 3,
        confirmedCount: 3,
        waitlistCount: 2,
      },
      {
        ...eventBase,
        id: 'ev-closed',
        title: '周日晚篮球 · 报名已截止',
        capacity: 10,
        confirmedCount: 1,
        signupDeadline: at(-1 * HOUR),
        startAt: at(1 * DAY),
        endAt: at(1 * DAY + 2 * HOUR),
      },
      {
        ...eventBase,
        id: 'ev-ongoing',
        title: '正在进行 · 比赛已开始',
        capacity: 10,
        confirmedCount: 1,
        signupDeadline: at(-2 * DAY),
        startAt: at(-1 * HOUR),
        endAt: at(1 * HOUR),
      },
      {
        ...eventBase,
        id: 'ev-finished',
        title: '已经结束',
        capacity: 10,
        confirmedCount: 1,
        signupDeadline: at(-3 * DAY),
        startAt: at(-3 * HOUR),
        endAt: at(-1 * HOUR),
      },
      {
        ...eventBase,
        id: 'ev-cancelled',
        title: '已取消',
        capacity: 10,
        confirmedCount: 1,
        signupDeadline: at(12 * HOUR),
        startAt: at(1 * DAY),
        endAt: at(1 * DAY + 2 * HOUR),
        cancelledAt: at(-1 * HOUR),
        cancelReason: '场地临时不可用',
      },
      {
        ...eventBase,
        id: 'ev-probe',
        title: '周末晚篮球 · 满员有候补',
        capacity: 2,
        confirmedCount: 2,
        waitlistCount: 1,
      },
      {
        ...eventBase,
        id: 'ev-promo',
        title: '候补转正演示 · 已满员',
        capacity: 1,
        confirmedCount: 1,
        waitlistCount: 1,
        // 演示站每 6 小时重置一次；这里留 2 天余量，重置偶发失败也不会让
        // 「取消报名 → 候补转正」在半天内就变成「报名已截止」。
        signupDeadline: at(2 * DAY),
        startAt: at(3 * DAY),
        endAt: at(3 * DAY + 2 * HOUR),
      },
    ],
  });

  const signup = (
    eventId: string,
    userId: string,
    status: SignupStatus = 'CONFIRMED',
    waitlistSeq: number | null = null,
  ) => ({
    id: `${eventId}:${userId}`,
    eventId,
    userId,
    status,
    waitlistSeq,
  });

  await prisma.signup.createMany({
    data: [
      signup('ev-full', 'u-3'),
      signup('ev-full', 'u-4'),
      signup('ev-full', 'u-5'),
      signup('ev-full', 'u-1', 'WAITLISTED', 1),
      signup('ev-full', 'u-2', 'WAITLISTED', 2),
      signup('ev-closed', 'u-1'),
      signup('ev-ongoing', 'u-1'),
      signup('ev-finished', 'u-1'),
      signup('ev-cancelled', 'u-3'),
      signup('ev-promo', 'u-4'),
      signup('ev-promo', 'u-5', 'WAITLISTED', 1),
      signup('ev-probe', 'u-probe-signed'),
      signup('ev-probe', 'u-probe-confirmed'),
      signup('ev-probe', 'u-probe-queued', 'WAITLISTED', 1),
    ],
  });
}

const isMain = require.main === module;

if (isMain) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => console.log('seed: 演示数据已写入'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
