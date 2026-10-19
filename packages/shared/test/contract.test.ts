import { describe, expect, it } from 'vitest';
import {
  BUTTON_STATES,
  BUTTON_STATE_META,
  resolveButtonState,
  type ButtonView,
} from '../src/index';
import {
  CANCELLED_AT,
  DEADLINE,
  END,
  EVENT,
  NOW,
  ORGANIZER_ID,
  START,
  VIEWER,
} from './fixtures';

const resolve = (input: {
  now?: Date;
  event?: Partial<typeof EVENT>;
  viewer?: Partial<typeof VIEWER>;
}): ButtonView =>
  resolveButtonState({
    now: input.now ?? NOW,
    event: { ...EVENT, ...input.event },
    viewer: { ...VIEWER, ...input.viewer },
  });

/** 每种状态一个代表样本，用来证明 9 态都可达。 */
const SAMPLES: ReadonlyArray<readonly [string, ButtonView]> = [
  ['CANCELLED', resolve({ event: { cancelledAt: CANCELLED_AT } })],
  ['FINISHED', resolve({ now: END })],
  ['MANAGE', resolve({ viewer: { userId: ORGANIZER_ID } })],
  ['SIGNED_UP', resolve({ viewer: { registrationStatus: 'CONFIRMED' } })],
  [
    'WAITLISTED',
    resolve({ viewer: { registrationStatus: 'WAITLISTED', waitlistSeq: 1 } }),
  ],
  ['CLOSED', resolve({ now: DEADLINE })],
  ['JOIN_WAITLIST', resolve({ event: { confirmedCount: 20 } })],
  ['SIGNUP_GUEST', resolve({ viewer: { userId: null } })],
  ['SIGNUP', resolve({})],
];

describe('9 态契约', () => {
  it('恰好 9 种状态，且没有重复', () => {
    expect(BUTTON_STATES).toHaveLength(9);
    expect(new Set(BUTTON_STATES).size).toBe(9);
  });

  it('元数据覆盖全部 9 态，漏一个 tsc 会报错', () => {
    expect(Object.keys(BUTTON_STATE_META).sort()).toEqual(
      [...BUTTON_STATES].sort(),
    );
  });

  it('每个状态都有非空说明', () => {
    for (const state of BUTTON_STATES) {
      expect(BUTTON_STATE_META[state].description.length).toBeGreaterThan(0);
    }
  });

  it('只有已取消与已结束是终态', () => {
    const terminal = BUTTON_STATES.filter(
      (state) => BUTTON_STATE_META[state].terminal,
    );
    expect(terminal.sort()).toEqual(['CANCELLED', 'FINISHED']);
  });

  it('样本能走到全部 9 态', () => {
    expect(SAMPLES.map(([expected]) => expected).sort()).toEqual(
      [...BUTTON_STATES].sort(),
    );
    for (const [expected, view] of SAMPLES) {
      expect(view.state).toBe(expected);
    }
  });

  it('置灰状态没有动作，可点状态必有动作', () => {
    for (const [, view] of SAMPLES) {
      if (view.variant === 'disabled') {
        expect(view.action).toBeNull();
      } else {
        expect(view.action).not.toBeNull();
      }
    }
  });

  it('所有返回值都落在 9 态之内', () => {
    for (const [, view] of SAMPLES) {
      expect(BUTTON_STATES).toContain(view.state);
    }
  });

  it('时间边界前后 1ms 会切换状态', () => {
    const beforeDeadline = resolve({ now: new Date(DEADLINE.getTime() - 1) });
    const atDeadline = resolve({ now: DEADLINE });
    const beforeStart = resolve({ now: new Date(START.getTime() - 1) });
    const atStart = resolve({ now: START });

    expect(beforeDeadline.state).toBe('SIGNUP');
    expect(atDeadline.state).toBe('CLOSED');
    expect(beforeStart.label).toBe('报名已截止');
    expect(atStart.label).toBe('比赛已开始');
  });
});
