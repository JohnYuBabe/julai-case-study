import 'reflect-metadata';
import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { seed } from '../prisma/seed';

interface ErrorBody {
  error: { code: string; message: string };
}

describe('events API（真实 MySQL）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const as = (userId?: string): Record<string, string> =>
    userId ? { 'x-demo-user-id': userId } : {};

  const expectError = async (
    res: request.Response,
    status: number,
    code: string,
  ): Promise<void> => {
    expect(res.status).toBe(status);
    expect((res.body as ErrorBody).error.code).toBe(code);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
  });

  // 每个用例都从同一份 seed 出发，单独运行 `-t` 也能通过。
  beforeEach(async () => {
    await seed(prisma);
  });

  // 跑完把演示数据恢复原样，方便接着手工看。
  afterAll(async () => {
    await seed(prisma);
    await app.close();
  });

  describe('读取', () => {
    it('健康检查返回 200 且数据库可用', async () => {
      const res = await request(server).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up' });
    });

    it('列表包含全部 5 种活动阶段', async () => {
      const res = await request(server).get('/api/events');
      expect(res.status).toBe(200);

      const byId = new Map<string, { status: string }>(
        (res.body.events as Array<{ id: string; status: string }>).map((e) => [
          e.id,
          e,
        ]),
      );
      expect(byId.get('ev-cancelled')?.status).toBe('CANCELLED');
      expect(byId.get('ev-finished')?.status).toBe('FINISHED');
      expect(byId.get('ev-ongoing')?.status).toBe('ONGOING');
      expect(byId.get('ev-closed')?.status).toBe('CLOSED');
      expect(byId.get('ev-open')?.status).toBe('OPEN');
    });

    it('未登录看到「立即报名」且要求登录', async () => {
      const res = await request(server).get('/api/events/ev-open');
      expect(res.status).toBe(200);
      expect(res.body.button).toMatchObject({
        state: 'SIGNUP_GUEST',
        action: 'signup',
        requireAuth: true,
      });
    });

    it('队长看到「管理本期活动」', async () => {
      const res = await request(server)
        .get('/api/events/ev-open')
        .set(as('u-organizer'));
      expect(res.body.button.state).toBe('MANAGE');
    });

    it('已取消优先于一切时间判断', async () => {
      const res = await request(server)
        .get('/api/events/ev-cancelled')
        .set(as('u-3'));
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.button.state).toBe('CANCELLED');
    });

    it('已结束优先于「我已报名」', async () => {
      const res = await request(server)
        .get('/api/events/ev-finished')
        .set(as('u-1'));
      expect(res.body.button.state).toBe('FINISHED');
    });

    it('比赛开始后已报名的人仍看到「已报名」但按钮置灰', async () => {
      const res = await request(server)
        .get('/api/events/ev-ongoing')
        .set(as('u-1'));
      expect(res.body.button).toMatchObject({
        state: 'SIGNED_UP',
        label: '已报名',
        variant: 'disabled',
        action: null,
      });
    });

    it('比赛开始后未报名的人看到「比赛已开始」', async () => {
      const res = await request(server)
        .get('/api/events/ev-ongoing')
        .set(as('u-7'));
      expect(res.body.button).toMatchObject({
        state: 'CLOSED',
        label: '比赛已开始',
      });
    });

    it('报名截止后看到「报名已截止」', async () => {
      const res = await request(server)
        .get('/api/events/ev-closed')
        .set(as('u-7'));
      expect(res.body.button).toMatchObject({
        state: 'CLOSED',
        label: '报名已截止',
      });
    });

    it('满员且未报名看到候补排位', async () => {
      const res = await request(server)
        .get('/api/events/ev-full')
        .set(as('u-7'));
      expect(res.body.button).toMatchObject({
        state: 'JOIN_WAITLIST',
        label: '加入候补（第 3 位）',
        action: 'join_waitlist',
        requireAuth: false,
      });
    });

    it('候补中的人看到自己的排位与退出动作', async () => {
      const res = await request(server)
        .get('/api/events/ev-promo')
        .set(as('u-5'));
      expect(res.body.button).toMatchObject({
        state: 'WAITLISTED',
        label: '候补中 · 第 1 位',
        action: 'leave_waitlist',
        confirm: true,
      });
    });

    it('不存在的活动返回 404', async () => {
      const res = await request(server).get('/api/events/nope');
      await expectError(res, 404, 'EVENT_NOT_FOUND');
    });

    it('不存在的路由返回统一的 404', async () => {
      const res = await request(server).get('/api/nope');
      await expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('身份', () => {
    it('未带身份写操作返回 401', async () => {
      const res = await request(server).post('/api/events/ev-open/signup');
      await expectError(res, 401, 'AUTH_REQUIRED');
    });

    it('未知演示用户返回 401', async () => {
      const res = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('nobody'));
      await expectError(res, 401, 'INVALID_DEMO_USER');
    });

    it('超大请求体返回 413 而不是 500', async () => {
      const res = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'))
        .send({ blob: 'x'.repeat(200_000) });
      await expectError(res, 413, 'HTTP_413');
    });
  });

  describe('报名与取消', () => {
    it('报名成功后重复报名返回 409，详情页能看到记录', async () => {
      const created = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'));

      expect(created.status).toBe(201);
      expect(created.body.result).toBe('confirmed');
      expect(created.body.event.confirmedCount).toBe(1);
      expect(created.body.event.remaining).toBe(19);
      expect(created.body.button).toMatchObject({
        state: 'SIGNED_UP',
        action: 'cancel_signup',
        confirm: true,
      });

      const duplicate = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'));
      await expectError(duplicate, 409, 'ALREADY_SIGNED_UP');

      const detail = await request(server)
        .get('/api/events/ev-open')
        .set(as('u-6'));
      expect(detail.body.registration).toEqual({
        status: 'CONFIRMED',
        waitlistSeq: null,
      });
    });

    it('取消报名释放名额，重复取消返回 409', async () => {
      await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'))
        .expect(201);

      const cancelled = await request(server)
        .delete('/api/events/ev-open/signup')
        .set(as('u-6'));

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.result).toBe('cancelled');
      expect(cancelled.body.promotion).toBeNull();
      expect(cancelled.body.event.confirmedCount).toBe(0);
      expect(cancelled.body.button.state).toBe('SIGNUP');

      const again = await request(server)
        .delete('/api/events/ev-open/signup')
        .set(as('u-6'));
      await expectError(again, 409, 'NOT_SIGNED_UP');
    });

    it('取消后可以重新报名，计数只加一次', async () => {
      await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'))
        .expect(201);
      await request(server)
        .delete('/api/events/ev-open/signup')
        .set(as('u-6'))
        .expect(200);

      const res = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'));

      expect(res.status).toBe(201);
      expect(res.body.event.confirmedCount).toBe(1);
      expect(res.body.registration).toEqual({
        status: 'CONFIRMED',
        waitlistSeq: null,
      });
    });

    it('满员时直接报名返回 409', async () => {
      const res = await request(server)
        .post('/api/events/ev-full/signup')
        .set(as('u-7'));
      await expectError(res, 409, 'SEATS_EXHAUSTED');
    });

    it('比赛开始后不能取消报名', async () => {
      const res = await request(server)
        .delete('/api/events/ev-ongoing/signup')
        .set(as('u-1'));
      await expectError(res, 409, 'SIGNUP_CLOSED');
    });

    it('已取消的活动不能报名', async () => {
      const res = await request(server)
        .post('/api/events/ev-cancelled/signup')
        .set(as('u-7'));
      await expectError(res, 409, 'EVENT_CANCELLED');
    });

    it('报名截止后不能报名', async () => {
      const res = await request(server)
        .post('/api/events/ev-closed/signup')
        .set(as('u-7'));
      await expectError(res, 409, 'SIGNUP_CLOSED');
    });

    it('队长不能报名、候补或取消', async () => {
      await expectError(
        await request(server)
          .post('/api/events/ev-open/signup')
          .set(as('u-organizer')),
        409,
        'ORGANIZER_CANNOT_PARTICIPATE',
      );
      await expectError(
        await request(server)
          .post('/api/events/ev-full/waitlist')
          .set(as('u-organizer')),
        409,
        'ORGANIZER_CANNOT_PARTICIPATE',
      );
      await expectError(
        await request(server)
          .delete('/api/events/ev-open/signup')
          .set(as('u-organizer')),
        409,
        'ORGANIZER_CANNOT_PARTICIPATE',
      );
    });
  });

  describe('候补', () => {
    it('满员时加入候补拿到票号与排位，重复加入返回 409', async () => {
      const res = await request(server)
        .post('/api/events/ev-full/waitlist')
        .set(as('u-7'));

      expect(res.status).toBe(201);
      expect(res.body.result).toBe('waitlisted');
      expect(res.body.waitlistSeq).toBe(3);
      expect(res.body.event.waitlistCount).toBe(3);
      expect(res.body.button).toMatchObject({
        state: 'WAITLISTED',
        label: '候补中 · 第 3 位',
        action: 'leave_waitlist',
      });

      const duplicate = await request(server)
        .post('/api/events/ev-full/waitlist')
        .set(as('u-7'));
      await expectError(duplicate, 409, 'ALREADY_WAITLISTED');
    });

    it('还有名额时加入候补返回 409', async () => {
      const res = await request(server)
        .post('/api/events/ev-open/waitlist')
        .set(as('u-8'));
      await expectError(res, 409, 'SEATS_AVAILABLE');
    });

    it('已报名的人不能加入候补', async () => {
      const res = await request(server)
        .post('/api/events/ev-full/waitlist')
        .set(as('u-3'));
      await expectError(res, 409, 'ALREADY_SIGNED_UP');
    });

    it('退出候补保留票号，但展示真实排位；重排拿到新票号', async () => {
      const left = await request(server)
        .delete('/api/events/ev-full/waitlist')
        .set(as('u-2'));

      expect(left.status).toBe(200);
      expect(left.body.result).toBe('left_waitlist');
      expect(left.body.event.waitlistCount).toBe(2);

      const u2 = await request(server)
        .get('/api/events/ev-full')
        .set(as('u-2'));
      expect(u2.body.button).toMatchObject({
        state: 'JOIN_WAITLIST',
        label: '加入候补（第 2 位）',
      });

      const u1 = await request(server)
        .get('/api/events/ev-full')
        .set(as('u-1'));
      expect(u1.body.button.label).toBe('候补中 · 第 1 位');

      const rejoined = await request(server)
        .post('/api/events/ev-full/waitlist')
        .set(as('u-2'));

      expect(rejoined.status).toBe(201);
      expect(rejoined.body.waitlistSeq).toBe(3);
      expect(rejoined.body.button.label).toBe('候补中 · 第 2 位');
    });

    it('取消报名后最早排队的人自动转正，人数不变', async () => {
      const res = await request(server)
        .delete('/api/events/ev-promo/signup')
        .set(as('u-4'));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('cancelled');
      expect(res.body.promotion).toEqual({ waitlistSeq: 1 });
      expect(res.body.event.confirmedCount).toBe(1);
      expect(res.body.event.remaining).toBe(0);
      expect(res.body.button).toMatchObject({
        state: 'JOIN_WAITLIST',
        label: '加入候补（第 1 位）',
      });

      const promoted = await request(server)
        .get('/api/events/ev-promo')
        .set(as('u-5'));
      expect(promoted.body.registration).toEqual({
        status: 'CONFIRMED',
        waitlistSeq: null,
      });
      expect(promoted.body.button.state).toBe('SIGNED_UP');
    });

    it('已取消的活动不能加入候补', async () => {
      const res = await request(server)
        .post('/api/events/ev-cancelled/waitlist')
        .set(as('u-7'));
      await expectError(res, 409, 'EVENT_CANCELLED');
    });

    it('比赛开始后不能退出候补', async () => {
      const res = await request(server)
        .delete('/api/events/ev-ongoing/waitlist')
        .set(as('u-1'));
      await expectError(res, 409, 'SIGNUP_CLOSED');
    });
  });
});
