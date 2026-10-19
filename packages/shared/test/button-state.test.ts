import { describe, expect, it } from 'vitest';
import {
  resolveButtonState,
  type ButtonEventInput,
  type ButtonView,
  type ButtonViewerInput,
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

function button(
  input: {
    now?: Date;
    event?: Partial<ButtonEventInput>;
    viewer?: Partial<ButtonViewerInput>;
  } = {},
): ButtonView {
  return resolveButtonState({
    now: input.now ?? NOW,
    event: { ...EVENT, ...input.event },
    viewer: { ...VIEWER, ...input.viewer },
  });
}

describe('9 种按钮状态各自可达', () => {
  it('1 CANCELLED：活动已取消', () => {
    const view = button({ event: { cancelledAt: CANCELLED_AT } });
    expect(view.state).toBe('CANCELLED');
    expect(view.label).toBe('活动已取消');
    expect(view.variant).toBe('disabled');
    expect(view.action).toBeNull();
  });

  it('2 FINISHED：活动已结束', () => {
    const view = button({ now: END });
    expect(view.state).toBe('FINISHED');
    expect(view.label).toBe('活动已结束');
    expect(view.action).toBeNull();
  });

  it('3 MANAGE：我是队长', () => {
    const view = button({ viewer: { userId: ORGANIZER_ID } });
    expect(view.state).toBe('MANAGE');
    expect(view.label).toBe('管理本期活动');
    expect(view.action).toBe('manage');
  });

  it('4 SIGNED_UP：开赛前可取消', () => {
    const view = button({
      viewer: { registrationStatus: 'CONFIRMED' },
    });
    expect(view.state).toBe('SIGNED_UP');
    expect(view.label).toBe('已报名 · 取消报名');
    expect(view.variant).toBe('ghost');
    expect(view.action).toBe('cancel_signup');
    expect(view.confirm).toBe(true);
  });

  it('5 WAITLISTED：候补中显示序号', () => {
    const view = button({
      viewer: { registrationStatus: 'WAITLISTED', waitlistSeq: 3 },
    });
    expect(view.state).toBe('WAITLISTED');
    expect(view.label).toBe('候补中 · 第 3 位');
    expect(view.action).toBe('leave_waitlist');
    expect(view.confirm).toBe(true);
  });

  it('6 CLOSED：报名已截止', () => {
    const view = button({ now: DEADLINE });
    expect(view.state).toBe('CLOSED');
    expect(view.label).toBe('报名已截止');
    expect(view.action).toBeNull();
  });

  it('7 JOIN_WAITLIST：已满，显示下一位', () => {
    const view = button({
      event: { confirmedCount: 20, waitlistCount: 3 },
    });
    expect(view.state).toBe('JOIN_WAITLIST');
    expect(view.label).toBe('加入候补（第 4 位）');
    expect(view.action).toBe('join_waitlist');
    expect(view.requireAuth).toBe(false);
  });

  it('8 SIGNUP_GUEST：未登录可看到报名按钮', () => {
    const view = button({ viewer: { userId: null } });
    expect(view.state).toBe('SIGNUP_GUEST');
    expect(view.label).toBe('立即报名');
    expect(view.action).toBe('signup');
    expect(view.requireAuth).toBe(true);
  });

  it('9 SIGNUP：已登录直接报名', () => {
    const view = button();
    expect(view.state).toBe('SIGNUP');
    expect(view.label).toBe('立即报名');
    expect(view.requireAuth).toBe(false);
  });
});

describe('判定优先级', () => {
  it('已取消压过队长', () => {
    const view = button({
      event: { cancelledAt: CANCELLED_AT },
      viewer: { userId: ORGANIZER_ID },
    });
    expect(view.state).toBe('CANCELLED');
  });

  it('已结束压过队长', () => {
    const view = button({
      now: new Date(END.getTime() + 1),
      viewer: { userId: ORGANIZER_ID },
    });
    expect(view.state).toBe('FINISHED');
  });

  it('队长压过自己的报名记录', () => {
    const view = button({
      viewer: { userId: ORGANIZER_ID, registrationStatus: 'CONFIRMED' },
    });
    expect(view.state).toBe('MANAGE');
  });

  it('已报名压过比赛已开始：开赛后显示已报名且置灰', () => {
    const view = button({
      now: START,
      viewer: { registrationStatus: 'CONFIRMED' },
    });
    expect(view.state).toBe('SIGNED_UP');
    expect(view.label).toBe('已报名');
    expect(view.variant).toBe('disabled');
    expect(view.action).toBeNull();
  });

  it('候补中压过比赛已开始：开赛后置灰', () => {
    const view = button({
      now: START,
      viewer: { registrationStatus: 'WAITLISTED', waitlistSeq: 2 },
    });
    expect(view.state).toBe('WAITLISTED');
    expect(view.label).toBe('候补中');
    expect(view.action).toBeNull();
  });

  it('比赛已开始压过报名截止的文案', () => {
    const view = button({
      now: START,
      event: { confirmedCount: 20 },
    });
    expect(view.state).toBe('CLOSED');
    expect(view.label).toBe('比赛已开始');
  });

  it('报名截止压过名额已满', () => {
    const view = button({
      now: DEADLINE,
      event: { confirmedCount: 20 },
    });
    expect(view.state).toBe('CLOSED');
    expect(view.label).toBe('报名已截止');
  });

  it('名额已满压过可报名', () => {
    const view = button({ event: { confirmedCount: 20 } });
    expect(view.state).toBe('JOIN_WAITLIST');
  });

  it('未登录请求即使带了报名状态，也按访客处理', () => {
    const view = button({
      viewer: { userId: null, registrationStatus: 'CONFIRMED' },
    });
    expect(view.state).toBe('SIGNUP_GUEST');
  });
});

describe('文案与登录态细节', () => {
  it('剩余 ≤ 3 时显示剩余名额', () => {
    const view = button({ event: { confirmedCount: 17 } });
    expect(view.state).toBe('SIGNUP');
    expect(view.label).toBe('立即报名（剩 3 位）');
  });

  it('剩余 4 时不显示数字', () => {
    const view = button({ event: { confirmedCount: 16 } });
    expect(view.label).toBe('立即报名');
  });

  it('访客加入候补也要先登录', () => {
    const view = button({
      event: { confirmedCount: 20 },
      viewer: { userId: null },
    });
    expect(view.state).toBe('JOIN_WAITLIST');
    expect(view.requireAuth).toBe(true);
  });

  it('候补序号缺失时退回「候补中」', () => {
    const view = button({
      viewer: { registrationStatus: 'WAITLISTED', waitlistSeq: null },
    });
    expect(view.label).toBe('候补中');
  });

  it('报名截止前 1ms 仍可报名，到点立刻关闭', () => {
    expect(
      button({ now: new Date(DEADLINE.getTime() - 1) }).label,
    ).toBe('立即报名');
    expect(button({ now: DEADLINE }).label).toBe('报名已截止');
  });

  it('开赛前 1ms 已不能报名，开赛后文案切换', () => {
    expect(button({ now: new Date(START.getTime() - 1) }).label).toBe(
      '报名已截止',
    );
    expect(button({ now: START }).label).toBe('比赛已开始');
  });
});
