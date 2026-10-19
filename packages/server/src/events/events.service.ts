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
  organizer_id: string;
}

/** 详情与写操作里用到的候补展示数据。 */
interface WaitlistSnapshot {
  /** 当前活跃候补人数。 */
  activeCount: number;
  /** 当前用户的实际排位，从 1 开始；不在候补队列时为 null。 */
  rank: number | null;
}

type SignupCounter = Pick<Prisma.TransactionClient, 'signup'>;

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
    const waitlist = await this.waitlistSnapshot(this.prisma, id, signup);

    return {
      ...this.toSummary(event, now),
      viewer,
      registration: this.toRegistration(signup, waitlist.rank),
      button: this.buttonFor(event, viewer?.id ?? null, signup, now, waitlist),
    };
  }

  /**
   * 报名。
   *
   * 所有写路径都先 `SELECT ... FOR UPDATE` 锁活动行，再读报名行——加锁顺序
   * 一致（events → signups），既不会死锁，也保证读到的是上一个事务提交后的
   * 状态。随后仍用条件 UPDATE 占位，数据库层再挡一次超卖。
   *
   * 为什么不能只靠 UNIQUE(event_id, user_id)：用户取消后行会保留为 CANCELLED，
   * 再次报名时 upsert 走的是 update 分支，不会触发唯一冲突；如果不在锁内
   * 重新判断状态，并发的多个请求会各自 +1，留下没有报名行的幽灵名额。
   */
  async signup(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockEvent(tx, id);
        this.assertNotOrganizer(locked.organizer_id, viewer.id);
        this.assertOpenForSignup(
          {
            cancelledAt: locked.cancelled_at,
            signupDeadline: locked.signup_deadline,
            startAt: locked.start_at,
          },
          now,
        );

        const existing = await tx.signup.findUnique({
          where: { eventId_userId: { eventId: id, userId: viewer.id } },
        });
        this.assertNotActive(existing);

        if (locked.confirmed_count >= locked.capacity) {
          throw Errors.seatsExhausted();
        }

        const affected = await tx.$executeRaw`
          UPDATE events
          SET confirmed_count = confirmed_count + 1,
              updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = ${id}
            AND confirmed_count < capacity
            AND cancelled_at IS NULL
            AND signup_deadline > ${now}`;

        if (affected === 0) throw Errors.seatsExhausted();

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
        return await this.toMutation(
          tx,
          'confirmed',
          updated,
          viewer,
          saved,
          now,
          '报名成功',
        );
      });
    } catch (error) {
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
   * 数据库里的 `waitlist_count` 是只增不减的票号；界面展示的「第 N 位」
   * 由当前活跃候补人数算出，退出者不会把别人的排位永久推高。
   */
  async joinWaitlist(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockEvent(tx, id);
        this.assertNotOrganizer(locked.organizer_id, viewer.id);
        this.assertOpenForSignup(
          {
            cancelledAt: locked.cancelled_at,
            signupDeadline: locked.signup_deadline,
            startAt: locked.start_at,
          },
          now,
        );

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
        return await this.toMutation(
          tx,
          'waitlisted',
          updated,
          viewer,
          saved,
          now,
          '已加入候补',
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
      this.assertNotOrganizer(locked.organizer_id, viewer.id);
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
      // 转正的永远是最早排队的那位，也就是当前排位第 1；票号可能已经很大。
      const message = next
        ? '已取消报名，候补第 1 位已自动转正'
        : '已取消报名，名额已释放';

      const mutation = await this.toMutation(
        tx,
        'cancelled',
        updated,
        viewer,
        saved,
        now,
        message,
      );

      return {
        ...mutation,
        promotion: next ? { waitlistSeq: next.waitlistSeq } : null,
      };
    });
  }

  /** 退出候补：只改报名行，不回退票号计数。 */
  async leaveWaitlist(id: string, header?: string): Promise<MutationView> {
    const viewer = await this.requireUser(header);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockEvent(tx, id);
      this.assertNotOrganizer(locked.organizer_id, viewer.id);
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
      return await this.toMutation(
        tx,
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
               confirmed_count, waitlist_count, organizer_id
        FROM events
        WHERE id = ${id}
        FOR UPDATE`
      .then((rows) => {
        const row = rows[0];
        if (!row) throw Errors.eventNotFound();
        return row;
      });
  }

  private async waitlistSnapshot(
    client: SignupCounter,
    eventId: string,
    signup: SignupLike | null,
  ): Promise<WaitlistSnapshot> {
    const activeCount = await client.signup.count({
      where: { eventId, status: 'WAITLISTED' },
    });

    if (signup?.status !== 'WAITLISTED' || signup.waitlistSeq === null) {
      return { activeCount, rank: null };
    }

    const rank = await client.signup.count({
      where: {
        eventId,
        status: 'WAITLISTED',
        waitlistSeq: { lte: signup.waitlistSeq },
      },
    });
    return { activeCount, rank };
  }

  private assertNotOrganizer(organizerId: string, userId: string): void {
    if (organizerId === userId) throw Errors.organizerCannotParticipate();
  }

  private assertNotCancelled(event: { cancelledAt: Date | null }): void {
    if (event.cancelledAt) throw Errors.eventCancelled();
  }

  private assertOpenForSignup(
    event: {
      cancelledAt: Date | null;
      signupDeadline: Date;
      startAt: Date;
    },
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
    waitlist: WaitlistSnapshot,
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
        activeWaitlistCount: waitlist.activeCount,
        signupDeadline: event.signupDeadline,
        startAt: event.startAt,
        endAt: event.endAt,
        cancelledAt: event.cancelledAt,
        organizerId: event.organizerId,
      },
      viewer: {
        userId: viewerId,
        registrationStatus,
        waitlistSeq: waitlist.rank,
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

  /**
   * `rank` 是当前队列里的实际排位，不是数据库里的票号。票号只用于 FIFO 转正，
   * 前面有人退出时不会回收，直接展示会让人看到「第 3 位」却只有 2 个人。
   */
  private toRegistration(
    signup: SignupLike | null,
    rank: number | null,
  ): RegistrationView | null {
    if (!signup) return null;
    return {
      status: signup.status,
      waitlistRank: signup.status === 'WAITLISTED' ? rank : null,
    };
  }

  private async toMutation(
    client: SignupCounter,
    result: MutationView['result'],
    event: EventLike,
    viewer: ViewerView,
    signup: SignupLike,
    now: Date,
    message: string,
    waitlistSeq: number | null = null,
  ): Promise<MutationView> {
    const waitlist = await this.waitlistSnapshot(client, event.id, signup);
    return {
      result,
      event: this.toSummary(event, now),
      viewer,
      registration: this.toRegistration(signup, waitlist.rank),
      button: this.buttonFor(event, viewer.id, signup, now, waitlist),
      message,
      waitlistSeq,
      promotion: null,
    };
  }
}
