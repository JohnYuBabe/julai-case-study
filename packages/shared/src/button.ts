import { deriveEventStatus } from './event-status';
import type {
  ButtonAction,
  ButtonVariant,
  ButtonView,
  RegistrationStatus,
} from './types';

export interface ButtonEventInput {
  capacity: number;
  confirmedCount: number;
  /**
   * 当前还在队列里的活跃候补人数（不含已退出的人）。
   * 只用来显示「加入候补（第 N 位）」，不是不可回收的票号。
   */
  waitlistCount: number;
  signupDeadline: Date;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
  organizerId: string;
}

export interface ButtonViewerInput {
  /** 未登录传 null。 */
  userId: string | null;
  registrationStatus: RegistrationStatus | null;
  /** 仅 `registrationStatus === 'WAITLISTED'` 时有值：当前排位，从 1 开始。 */
  waitlistSeq: number | null;
}

export interface ButtonInput {
  now: Date;
  event: ButtonEventInput;
  viewer: ButtonViewerInput;
}

/** 剩余名额 ≤ 3 时才把数字写进按钮，避免「还剩 18 位」这种劝退文案。 */
const SCARCITY_THRESHOLD = 3;

const view = (
  state: ButtonView['state'],
  label: string,
  variant: ButtonVariant,
  action: ButtonAction,
  requireAuth = false,
): ButtonView => ({
  state,
  label,
  variant,
  action,
  requireAuth,
  confirm: false,
});

/**
 * 详情页唯一的状态判定入口。服务端调用它，把返回值整个下发给前端。
 *
 * 判定顺序与产品《接口设计》§3.3 一致，另外把「开赛后取消」修正为置灰：
 *
 * 1. 已取消
 * 2. 已结束
 * 3. 我是队长
 * 4. 我已报名
 * 5. 我在候补
 * 6. 比赛已开始 / 报名已截止
 * 7. 名额已满 → 候补
 * 8. 可报名（未登录 / 已登录）
 *
 * 第 4、5 条排在「比赛已开始」之前，是为了让已报名的人在开赛后看到「已报名」
 * 而不是「比赛已开始」；此时两个按钮都置灰，动作置空。
 */
export function resolveButtonState(input: ButtonInput): ButtonView {
  const { event, viewer } = input;
  const now = input.now.getTime();

  const status = deriveEventStatus({
    now: input.now,
    signupDeadline: event.signupDeadline,
    startAt: event.startAt,
    endAt: event.endAt,
    cancelledAt: event.cancelledAt,
  });

  if (status === 'CANCELLED') {
    return view('CANCELLED', '活动已取消', 'disabled', null);
  }

  if (status === 'FINISHED') {
    return view('FINISHED', '活动已结束', 'disabled', null);
  }

  if (viewer.userId !== null && viewer.userId === event.organizerId) {
    return view('MANAGE', '管理本期活动', 'primary', 'manage');
  }

  // 未登录的请求不可能有报名记录；把不一致的入参当成访客处理。
  const registration =
    viewer.userId === null ? null : viewer.registrationStatus;
  const beforeStart = now < event.startAt.getTime();

  if (registration === 'CONFIRMED') {
    if (beforeStart) {
      return {
        ...view('SIGNED_UP', '已报名 · 取消报名', 'ghost', 'cancel_signup'),
        confirm: true,
        confirmText: '取消后名额会释放给候补的人，确定吗？',
      };
    }
    return view('SIGNED_UP', '已报名', 'disabled', null);
  }

  if (registration === 'WAITLISTED') {
    const seq = viewer.waitlistSeq;
    const label = seq === null ? '候补中' : `候补中 · 第 ${seq} 位`;
    if (beforeStart) {
      return {
        ...view('WAITLISTED', label, 'ghost', 'leave_waitlist'),
        confirm: true,
        confirmText: '退出后就排到队尾了，确定吗？',
      };
    }
    return view('WAITLISTED', '候补中', 'disabled', null);
  }

  if (now >= event.startAt.getTime()) {
    return view('CLOSED', '比赛已开始', 'disabled', null);
  }

  if (now >= event.signupDeadline.getTime()) {
    return view('CLOSED', '报名已截止', 'disabled', null);
  }

  if (event.confirmedCount >= event.capacity) {
    return view(
      'JOIN_WAITLIST',
      `加入候补（第 ${event.waitlistCount + 1} 位）`,
      'primary',
      'join_waitlist',
      viewer.userId === null,
    );
  }

  const remaining = event.capacity - event.confirmedCount;
  const label =
    remaining <= SCARCITY_THRESHOLD
      ? `立即报名（剩 ${remaining} 位）`
      : '立即报名';

  if (viewer.userId === null) {
    return view('SIGNUP_GUEST', label, 'primary', 'signup', true);
  }

  return view('SIGNUP', label, 'primary', 'signup');
}
