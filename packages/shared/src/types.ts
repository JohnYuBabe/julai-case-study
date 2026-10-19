/**
 * 案例的共享契约：9 种按钮状态与时间阶段。
 *
 * 这个包不依赖任何框架、不读环境变量、不碰 I/O，`now` 一律由调用方注入。
 * 服务端与 web-demo 引用同一份定义；web-demo 只渲染服务端下发的 ButtonView。
 */

/**
 * 9 种按钮状态，顺序与产品《信息架构》§3.1 的矩阵一致。
 * 这里是唯一的事实来源：新增或删除状态会同时影响服务端、前端与测试。
 */
export const BUTTON_STATES = [
  'CANCELLED',
  'FINISHED',
  'MANAGE',
  'SIGNED_UP',
  'WAITLISTED',
  'CLOSED',
  'JOIN_WAITLIST',
  'SIGNUP_GUEST',
  'SIGNUP',
] as const;

export type ButtonState = (typeof BUTTON_STATES)[number];

/** 活动的时间阶段。`cancelledAt` 是队长做过的动作，优先于一切时间判断。 */
export const EVENT_STATUSES = [
  'CANCELLED',
  'FINISHED',
  'ONGOING',
  'CLOSED',
  'OPEN',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/** 参与按钮判定的报名状态。数据库里的 `CANCELLED` 行仍保留，服务端会把它映射为 null。 */
export type RegistrationStatus = 'CONFIRMED' | 'WAITLISTED';

export type ButtonVariant = 'primary' | 'ghost' | 'disabled';

/** 按钮点下去要调的接口动作。置灰状态为 `null`。 */
export type ButtonAction =
  | 'signup'
  | 'join_waitlist'
  | 'cancel_signup'
  | 'leave_waitlist'
  | 'manage'
  | null;

/** 服务端下发给前端的完整按钮视图。前端不再做任何状态判断。 */
export interface ButtonView {
  state: ButtonState;
  label: string;
  variant: ButtonVariant;
  action: ButtonAction;
  /** 点击前是否需要先登录（只有访客的报名/候补需要）。 */
  requireAuth: boolean;
  /** 点击前是否需要二次确认。 */
  confirm: boolean;
  confirmText?: string;
  /** 置灰时给用户的原因；文案由服务端决定，前端不按 state 再推导一次。 */
  reason?: string;
}

/** 每种状态的静态说明，用于文档、测试与前端兜底文案。 */
export interface ButtonStateMeta {
  /** 一句话说明这个状态在什么条件下出现。 */
  description: string;
  /** 终态：不会再因为时间推进而回到可操作状态。 */
  terminal: boolean;
}
