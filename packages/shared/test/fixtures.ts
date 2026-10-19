import type { ButtonEventInput, ButtonViewerInput } from '../src/index.js';

export const DEADLINE = new Date('2026-11-01T18:00:00.000Z');
export const START = new Date('2026-11-01T19:00:00.000Z');
export const END = new Date('2026-11-01T21:00:00.000Z');
export const NOW = new Date('2026-11-01T12:00:00.000Z');
export const CANCELLED_AT = new Date('2026-11-01T11:00:00.000Z');

export const ORGANIZER_ID = 'u-organizer';

export const EVENT: ButtonEventInput = {
  capacity: 20,
  confirmedCount: 10,
  waitlistCount: 0,
  signupDeadline: DEADLINE,
  startAt: START,
  endAt: END,
  cancelledAt: null,
  organizerId: ORGANIZER_ID,
};

export const VIEWER: ButtonViewerInput = {
  userId: 'u-1',
  registrationStatus: null,
  waitlistSeq: null,
};
