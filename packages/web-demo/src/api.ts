import type { ButtonView, EventStatus } from '@julai/shared';

export interface ViewerView {
  id: string;
  name: string;
}

export interface EventSummary {
  id: string;
  title: string;
  status: EventStatus;
  capacity: number;
  confirmedCount: number;
  remaining: number;
  /** 已发出的候补号数量，只增不减；不是当前排队人数。 */
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
  /** 当前候补排位；不是票号。 */
  waitlistRank: number | null;
}

export interface EventList {
  viewer: ViewerView | null;
  events: EventSummary[];
}

export interface EventDetail extends EventSummary {
  viewer: ViewerView | null;
  registration: RegistrationView | null;
  button: ButtonView;
}

export type MutationResult =
  | 'confirmed'
  | 'waitlisted'
  | 'cancelled'
  | 'left_waitlist';

export interface MutationResponse {
  result: MutationResult;
  event: EventSummary;
  viewer: ViewerView;
  registration: RegistrationView | null;
  button: ButtonView;
  message: string;
  waitlistSeq: number | null;
  promotion: { waitlistSeq: number | null } | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const configured = import.meta.env.VITE_API_BASE;
const API_BASE = (configured && configured.length > 0 ? configured : '/api').replace(
  /\/+$/,
  '',
);

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function request<T>(
  path: string,
  identity: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (identity) headers.set('x-demo-user-id', identity);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('连不上服务端，请确认本地 API 已启动。', 'NETWORK_ERROR', 0);
  }

  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // 代理层可能返回 HTML，保留状态码即可。
    }
    throw new ApiError(
      body.error?.message ?? `请求失败（HTTP ${response.status}）`,
      body.error?.code ?? `HTTP_${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  list: (identity: string | null): Promise<EventList> =>
    request('/events', identity),

  detail: (id: string, identity: string | null): Promise<EventDetail> =>
    request(`/events/${encodeURIComponent(id)}`, identity),

  signup: (id: string, identity: string | null): Promise<MutationResponse> =>
    request(`/events/${encodeURIComponent(id)}/signup`, identity, {
      method: 'POST',
    }),

  joinWaitlist: (
    id: string,
    identity: string | null,
  ): Promise<MutationResponse> =>
    request(`/events/${encodeURIComponent(id)}/waitlist`, identity, {
      method: 'POST',
    }),

  cancelSignup: (
    id: string,
    identity: string | null,
  ): Promise<MutationResponse> =>
    request(`/events/${encodeURIComponent(id)}/signup`, identity, {
      method: 'DELETE',
    }),

  leaveWaitlist: (
    id: string,
    identity: string | null,
  ): Promise<MutationResponse> =>
    request(`/events/${encodeURIComponent(id)}/waitlist`, identity, {
      method: 'DELETE',
    }),
};
