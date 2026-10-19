import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务错误统一带一个稳定的 `code`，前端与并发测试只认这个字段，
 * 不靠自然语言文案做判断。
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super(message, status);
  }
}

const fail = (code: string, message: string, status: HttpStatus) =>
  new ApiException(code, message, status);

export const Errors = {
  authRequired: () =>
    fail('AUTH_REQUIRED', '这个操作需要先登录', HttpStatus.UNAUTHORIZED),
  invalidDemoUser: () =>
    fail('INVALID_DEMO_USER', '演示用户不存在', HttpStatus.UNAUTHORIZED),
  eventNotFound: () =>
    fail('EVENT_NOT_FOUND', '活动不存在', HttpStatus.NOT_FOUND),
  eventCancelled: () =>
    fail('EVENT_CANCELLED', '活动已取消', HttpStatus.CONFLICT),
  signupClosed: () =>
    fail(
      'SIGNUP_CLOSED',
      '报名已截止或比赛已开始，不能再操作',
      HttpStatus.CONFLICT,
    ),
  seatsExhausted: () =>
    fail('SEATS_EXHAUSTED', '名额已满，可以加入候补', HttpStatus.CONFLICT),
  seatsAvailable: () =>
    fail('SEATS_AVAILABLE', '还有名额，直接报名即可', HttpStatus.CONFLICT),
  alreadySignedUp: () =>
    fail('ALREADY_SIGNED_UP', '你已经报名了这个活动', HttpStatus.CONFLICT),
  alreadyWaitlisted: () =>
    fail('ALREADY_WAITLISTED', '你已经在候补队列里了', HttpStatus.CONFLICT),
  notSignedUp: () =>
    fail('NOT_SIGNED_UP', '你没有报名这个活动', HttpStatus.CONFLICT),
  notWaitlisted: () =>
    fail('NOT_WAITLISTED', '你不在候补队列里', HttpStatus.CONFLICT),
};
