import type { ButtonView, EventStatus } from '@julai/shared';

export interface ViewerView {
  id: string;
  name: string;
}

export interface EventSummaryView {
  id: string;
  title: string;
  status: EventStatus;
  capacity: number;
  confirmedCount: number;
  /** 剩余名额，最小为 0。 */
  remaining: number;
  /** 已经发出的候补序号个数；只增不减。 */
  waitlistCount: number;
  signupDeadline: string;
  startAt: string;
  endAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  organizerId: string;
}

export interface RegistrationView {
  status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';
  waitlistSeq: number | null;
}

export interface EventListView {
  viewer: ViewerView | null;
  events: EventSummaryView[];
}

export interface EventDetailView extends EventSummaryView {
  viewer: ViewerView | null;
  registration: RegistrationView | null;
  button: ButtonView;
}

export type MutationResult =
  | 'confirmed'
  | 'waitlisted'
  | 'cancelled'
  | 'left_waitlist';

export interface PromotionView {
  userId: string;
  waitlistSeq: number | null;
}

export interface MutationView {
  result: MutationResult;
  event: EventSummaryView;
  viewer: ViewerView;
  registration: RegistrationView | null;
  button: ButtonView;
  message: string;
  /** 仅加入候补时返回；退出后重排会拿到新号。 */
  waitlistSeq: number | null;
  /** 仅取消报名时可能非空：谁被自动转正。 */
  promotion: PromotionView | null;
}
