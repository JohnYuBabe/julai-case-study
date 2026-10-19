import { describe, expect, it } from 'vitest';
import { deriveEventStatus } from '../src/index.js';
import {
  CANCELLED_AT,
  DEADLINE,
  END,
  NOW,
  START,
} from './fixtures.js';

const at = (now: Date) =>
  deriveEventStatus({
    now,
    signupDeadline: DEADLINE,
    startAt: START,
    endAt: END,
    cancelledAt: null,
  });

describe('deriveEventStatus', () => {
  it('报名截止前是 OPEN', () => {
    expect(at(NOW)).toBe('OPEN');
  });

  it('恰好到报名截止时刻进入 CLOSED', () => {
    expect(at(DEADLINE)).toBe('CLOSED');
  });

  it('报名截止前 1ms 仍是 OPEN', () => {
    expect(at(new Date(DEADLINE.getTime() - 1))).toBe('OPEN');
  });

  it('恰好到开赛时刻进入 ONGOING', () => {
    expect(at(START)).toBe('ONGOING');
  });

  it('开赛前 1ms 且已过截止是 CLOSED', () => {
    expect(at(new Date(START.getTime() - 1))).toBe('CLOSED');
  });

  it('恰好到结束时刻进入 FINISHED', () => {
    expect(at(END)).toBe('FINISHED');
  });

  it('结束前 1ms 仍是 ONGOING', () => {
    expect(at(new Date(END.getTime() - 1))).toBe('ONGOING');
  });

  it('已取消压过已结束', () => {
    const status = deriveEventStatus({
      now: new Date(END.getTime() + 60_000),
      signupDeadline: DEADLINE,
      startAt: START,
      endAt: END,
      cancelledAt: CANCELLED_AT,
    });
    expect(status).toBe('CANCELLED');
  });

  it('取消发生在任何时间点都返回 CANCELLED', () => {
    const status = deriveEventStatus({
      now: NOW,
      signupDeadline: DEADLINE,
      startAt: START,
      endAt: END,
      cancelledAt: CANCELLED_AT,
    });
    expect(status).toBe('CANCELLED');
  });
});
