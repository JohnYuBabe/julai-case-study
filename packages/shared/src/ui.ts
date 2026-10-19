import type { ButtonState, ButtonStateMeta } from './types';

/**
 * 9 种状态的静态元数据。
 *
 * 类型是 `Record<ButtonState, ButtonStateMeta>`：漏掉任何一态，`tsc` 直接失败。
 * 动态文案与样式不放在这里 —— 它们由 `resolveButtonState` 计算后随接口下发。
 */
export const BUTTON_STATE_META: Record<ButtonState, ButtonStateMeta> = {
  CANCELLED: {
    description: '队长取消过这场活动，压过一切时间判断',
    terminal: true,
  },
  FINISHED: {
    description: '已经过了 endAt',
    terminal: true,
  },
  MANAGE: {
    description: '当前用户是队长，排在自己的报名状态之前',
    terminal: false,
  },
  SIGNED_UP: {
    description: '当前用户已报名；开赛前可取消，开赛后置灰',
    terminal: false,
  },
  WAITLISTED: {
    description: '当前用户在候补队列；开赛前可退出，开赛后置灰',
    terminal: false,
  },
  CLOSED: {
    description: '比赛已开始或已过报名截止，且没有报名记录',
    terminal: false,
  },
  JOIN_WAITLIST: {
    description: '名额已满、仍可加入候补',
    terminal: false,
  },
  SIGNUP_GUEST: {
    description: '未登录、还有名额；点击先登录再报名',
    terminal: false,
  },
  SIGNUP: {
    description: '已登录、还有名额',
    terminal: false,
  },
};
