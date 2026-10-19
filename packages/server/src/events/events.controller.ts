import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { EventsService } from './events.service';
import type {
  EventDetailView,
  EventListView,
  MutationView,
} from './events.types';

/**
 * 演示用的身份：真实产品从会话里取用户，这里显式用请求头，
 * 方便并发脚本同时扮演 50 个不同的人。
 */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Headers('x-demo-user-id') userId?: string): Promise<EventListView> {
    return this.events.list(userId);
  }

  @Get(':id')
  detail(
    @Param('id') id: string,
    @Headers('x-demo-user-id') userId?: string,
  ): Promise<EventDetailView> {
    return this.events.detail(id, userId);
  }

  @Post(':id/signup')
  @HttpCode(HttpStatus.CREATED)
  signup(
    @Param('id') id: string,
    @Headers('x-demo-user-id') userId?: string,
  ): Promise<MutationView> {
    return this.events.signup(id, userId);
  }

  @Post(':id/waitlist')
  @HttpCode(HttpStatus.CREATED)
  joinWaitlist(
    @Param('id') id: string,
    @Headers('x-demo-user-id') userId?: string,
  ): Promise<MutationView> {
    return this.events.joinWaitlist(id, userId);
  }

  @Delete(':id/signup')
  cancelSignup(
    @Param('id') id: string,
    @Headers('x-demo-user-id') userId?: string,
  ): Promise<MutationView> {
    return this.events.cancelSignup(id, userId);
  }

  @Delete(':id/waitlist')
  leaveWaitlist(
    @Param('id') id: string,
    @Headers('x-demo-user-id') userId?: string,
  ): Promise<MutationView> {
    return this.events.leaveWaitlist(id, userId);
  }
}
