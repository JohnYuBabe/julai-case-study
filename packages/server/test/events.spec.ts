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
    await seed(prisma);
    server = app.getHttpServer();
  });

  afterAll(async () => {
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

    it('满员且未报名看到候补序号', async () => {
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
  });

  describe('报名与取消', () => {
    it('报名成功返回 201 并下发「已报名」', async () => {
      const res = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'));

      expect(res.status).toBe(201);
      expect(res.body.result).toBe('confirmed');
      expect(res.body.event.confirmedCount).toBe(1);
      expect(res.body.event.remaining).toBe(19);
      expect(res.body.button).toMatchObject({
        state: 'SIGNED_UP',
        action: 'cancel_signup',
        confirm: true,
      });
    });

    it('重复报名返回 409', async () => {
      const res = await request(server)
        .post('/api/events/ev-open/signup')
        .set(as('u-6'));
      await expectError(res, 409, 'ALREADY_SIGNED_UP');
    });

    it('详情页能看到自己的报名记录', async () => {
      const res = await request(server)
        .get('/api/events/ev-open')
        .set(as('u-6'));
      expect(res.body.registration).toEqual({
        status: 'CONFIRMED',
        waitlistSeq: null,
      });
    });

    it('取消报名释放名额', async () => {
      const res = await request(server)
        .delete('/api/events/ev-open/signup')
        .set(as('u-6'));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('cancelled');
      expect(res.body.promotion).toBeNull();
      expect(res.body.event.confirmedCount).toBe(0);
      expect(res.body.button.state).toBe('SIGNUP');
    });

    it('取消未报名的活动返回 409', async () => {
      const res = await request(server)
        .delete('/api/events/ev-open/signup')
        .set(as('u-6'));
      await expectError(res, 409, 'NOT_SIGNED_UP');
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
  });

  describe('候补', () => {
    it('满员时加入候补拿到下一个序号', async () => {
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
    });

    it('重复加入候补返回 409', async () => {
      const res = await request(server)
        .post('/api/events/ev-full/waitlist')
        .set(as('u-7'));
      await expectError(res, 409, 'ALREADY_WAITLISTED');
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

    it('退出候补不回收序号，重排要拿新号', async () => {
      const leave = await request(server)
        .delete('/api/events/ev-full/waitlist')
        .set(as('u-2'));

      expect(leave.status).toBe(200);
      expect(leave.body.result).toBe('left_waitlist');
      expect(leave.body.event.waitlistCount).toBe(3);
      expect(leave.body.registration).toEqual({
        status: 'CANCELLED',
        waitlistSeq: null,
      });

      const detail = await request(server)
        .get('/api/events/ev-full')
        .set(as('u-2'));
      expect(detail.body.button).toMatchObject({
        state: 'JOIN_WAITLIST',
        label: '加入候补（第 4 位）',
      });
    });

    it('取消报名后最早排队的人自动转正，人数不变', async () => {
      const res = await request(server)
        .delete('/api/events/ev-promo/signup')
        .set(as('u-4'));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('cancelled');
      expect(res.body.promotion).toEqual({ userId: 'u-5', waitlistSeq: 1 });
      expect(res.body.event.confirmedCount).toBe(1);
      expect(res.body.event.remaining).toBe(0);
      expect(res.body.button.state).toBe('JOIN_WAITLIST');
    });

    it('转正后的候补在详情页显示「已报名」', async () => {
      const res = await request(server)
        .get('/api/events/ev-promo')
        .set(as('u-5'));
      expect(res.body.registration).toEqual({
        status: 'CONFIRMED',
        waitlistSeq: null,
      });
      expect(res.body.button.state).toBe('SIGNED_UP');
    });
  });
});
