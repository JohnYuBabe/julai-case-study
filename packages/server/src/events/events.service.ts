import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type SignupStatus } from '@prisma/client';
import {
  deriveEventStatus,
  resolveButtonState,
  type ButtonView,
} from '@julai/shared';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type {
  EventDetailView,
  EventListView,
  EventSummaryView,
  MutationView,
  RegistrationView,
  ViewerView,
} from './events.types';

/** 只描述服务层用得到的字段，Prisma 的完整模型可以直接传进来。 */
interface EventLike {
  id: string;
  title: string;
  capacity: number;
  confirmedCount: number;
  waitlistCount: number;
  signupDeadline: Date;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  organizerId: string;
}

interface SignupLike {
  status: SignupStatus;
  waitlistSeq: number | null;
}

/** `SELECT ... FOR UPDATE` 返回的 snake_case 行。 */
interface LockedEventRow {
  id: string;
  cancelled_at: Date | null;
  signup_deadline: Date;
  start_at: Date;
  capacity: number;
  confirmed_count: number;
  waitlist_count: number;
}

const iso = (date: Date): string => date.toISOString();

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(header?: string): Promise<EventListView> {
    const viewer = await this.optionalUser(header);
    const now = new Date();
    const events = await this.prisma.event.findMany({
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return {
      viewer,
      events: events.map((event) => this.toSummary(event, now)),
    };
  }

  async detail(id: string, header?: string): Promise<EventDetailView> {
    const viewer = await this.optionalUser(header);
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw Errors.eventNotFound();

    const now = new Date();
    const signup = viewer
      ? await this.prisma.signup.findUnique({
          where: { eventId_userId: { eventId: id, userId: viewer.id } },
        })
      : null;

    return {
      ...this.toSummary(event, now),
      viewer,
      registration: this.toRegistration(signup),
      button: this.buttonFor(event, viewer?.id ?? null, signup, now),
    };
  }

  /**
   * 报名：名额判断放在一条条件 UPDATE 里，而不是先 SELECT 再 UPDATE。
   * 并发下只有抢到名额的请求会让 `confirmed_count + 1` 生效。
   */
  async signup(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.event.findUnique({ where: { id } });
        if (!event) throw Errors.eventNotFound();
        this.assertOpenForSignup(event, now);

        const existing = await tx.signup.findUnique({
          where: { eventId_userId: { eventId: id, userId: viewer.id } },
        });
        this.assertNotActive(existing);

        const affected = await tx.$executeRaw`
          UPDATE events
          SET confirmed_count = confirmed_count + 1,
              updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = ${id}
            AND confirmed_count < capacity
            AND cancelled_at IS NULL
            AND signup_deadline > ${now}
            AND NOT EXISTS (
              SELECT 1 FROM signups
              WHERE event_id = ${id}
                AND user_id = ${viewer.id}
                AND status IN ('CONFIRMED', 'WAITLISTED')
            )`;

        if (affected === 0) {
          await this.explainFailedSignup(tx, id, viewer.id, now);
        }

        const saved = await tx.signup.upsert({
          where: { eventId_userId: { eventId: id, userId: viewer.id } },
          create: {
            id: randomUUID(),
            eventId: id,
            userId: viewer.id,
            status: 'CONFIRMED',
          },
          update: { status: 'CONFIRMED', waitlistSeq: null },
        });

        const updated = await tx.event.findUniqueOrThrow({ where: { id } });
        return this.toMutation(
          'confirmed',
          updated,
          viewer,
          saved,
          now,
          '报名成功',
        );
      });
    } catch (error) {
      // 同一用户的并发报名：后插入的一方撞唯一约束，整个事务（含 +1）回滚。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.alreadySignedUp();
      }
      throw error;
    }
  }

  /**
   * 加入候补：先锁活动行，再发放序号。
   * 候补序号来自 `waitlist_count`，只增不减，退出后重排会拿到更大的号。
   */
  async joinWaitlist(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockEvent(tx, id);
        this.assertNotCancelled({ cancelledAt: locked.cancelled_at });
        if (now >= locked.start_at || now >= locked.signup_deadline) {
          throw Errors.signupClosed();
        }

        const existing = await tx.signup.findUnique({
          where: { eventId_userId: { eventId: id, userId: viewer.id } },
        });
        this.assertNotActive(existing);

        if (locked.confirmed_count < locked.capacity) {
          throw Errors.seatsAvailable();
        }

        const seq = locked.waitlist_count + 1;
        await tx.event.update({
          where: { id },
          data: { waitlistCount: { increment: 1 } },
        });
        const saved = await tx.signup.upsert({
          where: { eventId_userId: { eventId: id, userId: viewer.id } },
          create: {
            id: randomUUID(),
            eventId: id,
            userId: viewer.id,
            status: 'WAITLISTED',
            waitlistSeq: seq,
          },
          update: { status: 'WAITLISTED', waitlistSeq: seq },
        });

        const updated = await tx.event.findUniqueOrThrow({ where: { id } });
        return this.toMutation(
          'waitlisted',
          updated,
          viewer,
          saved,
          now,
          `已加入候补，当前第 ${seq} 位`,
          seq,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.alreadyWaitlisted();
      }
      throw error;
    }
  }

  /**
   * 取消报名：在同一事务里取消并转正最早排队的候补。
   * 有人转正时 confirmed_count 不变，否则才减 1。
   */
  async cancelSignup(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockEvent(tx, id);
      this.assertNotCancelled({ cancelledAt: locked.cancelled_at });
      if (now >= locked.start_at) throw Errors.signupClosed();

      const existing = await tx.signup.findUnique({
        where: { eventId_userId: { eventId: id, userId: viewer.id } },
      });
      if (existing?.status !== 'CONFIRMED') throw Errors.notSignedUp();

      const next = await tx.signup.findFirst({
        where: { eventId: id, status: 'WAITLISTED' },
        orderBy: [{ waitlistSeq: 'asc' }, { createdAt: 'asc' }],
      });

      const saved = await tx.signup.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', waitlistSeq: null },
      });

      if (next) {
        await tx.signup.update({
          where: { id: next.id },
          data: { status: 'CONFIRMED', waitlistSeq: null },
        });
      } else {
        await tx.event.update({
          where: { id },
          data: { confirmedCount: { decrement: 1 } },
        });
      }

      const updated = await tx.event.findUniqueOrThrow({ where: { id } });
      const message = next
        ? `已取消报名，候补第 ${next.waitlistSeq ?? '?'} 位已自动转正`
        : '已取消报名，名额已释放';

      return {
        ...this.toMutation(
          'cancelled',
          updated,
          viewer,
          saved,
          now,
          message,
        ),
        promotion: next
          ? { userId: next.userId, waitlistSeq: next.waitlistSeq }
          : null,
      };
    });
  }

  /** 退出候补：只改报名行，不回退 `waitlist_count`。 */
  async leaveWaitlist(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockEvent(tx, id);
      this.assertNotCancelled({ cancelledAt: locked.cancelled_at });
      if (now >= locked.start_at) throw Errors.signupClosed();

      const existing = await tx.signup.findUnique({
        where: { eventId_userId: { eventId: id, userId: viewer.id } },
      });
      if (existing?.status !== 'WAITLISTED') throw Errors.notWaitlisted();

      const saved = await tx.signup.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', waitlistSeq: null },
      });

      const updated = await tx.event.findUniqueOrThrow({ where: { id } });
      return this.toMutation(
        'left_waitlist',
        updated,
        viewer,
        saved,
        now,
        '已退出候补',
      );
    });
  }

  // ---------------------------------------------------------------------------
  // 内部工具
  // ---------------------------------------------------------------------------

  private async optionalUser(header?: string): Promise<ViewerView | null> {
    const id = header?.trim();
    if (!id) return null;
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) throw Errors.invalidDemoUser();
    return user;
  }

  private async requireUser(header?: string): Promise<ViewerView> {
    const viewer = await this.optionalUser(header);
    if (!viewer) throw Errors.authRequired();
    return viewer;
  }

  private lockEvent(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<LockedEventRow> {
    return tx
      .$queryRaw<LockedEventRow[]>`
        SELECT id, cancelled_at, signup_deadline, start_at, capacity,
               confirmed_count, waitlist_count
        FROM events
        WHERE id = ${id}
        FOR UPDATE`
      .then((rows) => {
        const row = rows[0];
        if (!row) throw Errors.eventNotFound();
        return row;
      });
  }

  /** 条件 UPDATE 没生效时，把「为什么没生效」翻译成具体错误码。 */
  private async explainFailedSignup(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    now: Date,
  ): Promise<never> {
    const fresh = await tx.event.findUnique({ where: { id } });
    if (!fresh) throw Errors.eventNotFound();
    this.assertNotCancelled(fresh);
    if (now >= fresh.startAt || now >= fresh.signupDeadline) {
      throw Errors.signupClosed();
    }

    const current = await tx.signup.findUnique({
      where: { eventId_userId: { eventId: id, userId } },
    });
    this.assertNotActive(current);

    throw Errors.seatsExhausted();
  }

  private assertNotCancelled(event: { cancelledAt: Date | null }): void {
    if (event.cancelledAt) throw Errors.eventCancelled();
  }

  private assertOpenForSignup(
    event: { cancelledAt: Date | null; signupDeadline: Date; startAt: Date },
    now: Date,
  ): void {
    this.assertNotCancelled(event);
    if (now >= event.startAt || now >= event.signupDeadline) {
      throw Errors.signupClosed();
    }
  }

  private assertNotActive(signup: SignupLike | null): void {
    if (signup?.status === 'CONFIRMED') throw Errors.alreadySignedUp();
    if (signup?.status === 'WAITLISTED') throw Errors.alreadyWaitlisted();
  }

  private buttonFor(
    event: EventLike,
    viewerId: string | null,
    signup: SignupLike | null,
    now: Date,
  ): ButtonView {
    const registrationStatus =
      signup?.status === 'CONFIRMED' || signup?.status === 'WAITLISTED'
        ? signup.status
        : null;

    return resolveButtonState({
      now,
      event: {
        capacity: event.capacity,
        confirmedCount: event.confirmedCount,
        waitlistCount: event.waitlistCount,
        signupDeadline: event.signupDeadline,
        startAt: event.startAt,
        endAt: event.endAt,
        cancelledAt: event.cancelledAt,
        organizerId: event.organizerId,
      },
      viewer: {
        userId: viewerId,
        registrationStatus,
        waitlistSeq: signup?.waitlistSeq ?? null,
      },
    });
  }

  private toSummary(event: EventLike, now: Date): EventSummaryView {
    return {
      id: event.id,
      title: event.title,
      status: deriveEventStatus({
        now,
        signupDeadline: event.signupDeadline,
        startAt: event.startAt,
        endAt: event.endAt,
        cancelledAt: event.cancelledAt,
      }),
      capacity: event.capacity,
      confirmedCount: event.confirmedCount,
      remaining: Math.max(0, event.capacity - event.confirmedCount),
      waitlistCount: event.waitlistCount,
      signupDeadline: iso(event.signupDeadline),
      startAt: iso(event.startAt),
      endAt: iso(event.endAt),
      cancelledAt: event.cancelledAt ? iso(event.cancelledAt) : null,
      cancelReason: event.cancelReason,
      organizerId: event.organizerId,
    };
  }

  private toRegistration(signup: SignupLike | null): RegistrationView | null {
    if (!signup) return null;
    return { status: signup.status, waitlistSeq: signup.waitlistSeq };
  }

  private toMutation(
    result: MutationView['result'],
    event: EventLike,
    viewer: ViewerView,
    signup: SignupLike,
    now: Date,
    message: string,
    waitlistSeq: number | null = null,
  ): MutationView {
    return {
      result,
      event: this.toSummary(event, now),
      viewer,
      registration: this.toRegistration(signup),
      button: this.buttonFor(event, viewer.id, signup, now),
      message,
      waitlistSeq,
      promotion: null,
    };
  }
}
