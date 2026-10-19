import type { EventStatus } from './types.js';

export interface EventStatusInput {
  now: Date;
  signupDeadline: Date;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
}

/**
 * 活动此刻的时间阶段。纯函数：只读入参，不查库、不读系统时钟。
 *
 * 判定顺序（不能调换）：
 * 1. 已取消 —— 终态，压过一切时间判断；
 * 2. 已结束 —— `now >= endAt`；
 * 3. 进行中 —— `now >= startAt`；
 * 4. 报名截止 —— `now >= signupDeadline`；
 * 5. 开放。
 *
 * 区间都是左闭右开：恰好到点的这一刻算进入下一阶段。
 */
export function deriveEventStatus(input: EventStatusInput): EventStatus {
  if (input.cancelledAt !== null) {
    return 'CANCELLED';
  }

  const now = input.now.getTime();
  if (now >= input.endAt.getTime()) {
    return 'FINISHED';
  }
  if (now >= input.startAt.getTime()) {
    return 'ONGOING';
  }
  if (now >= input.signupDeadline.getTime()) {
    return 'CLOSED';
  }
  return 'OPEN';
}
