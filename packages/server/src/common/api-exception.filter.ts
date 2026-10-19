import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiException } from './errors';

interface ErrorBody {
  error: { code: string; message: string };
}

/** 把业务错误与框架 404 统一成 `{ error: { code, message } }`。 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiException) {
      response
        .status(exception.getStatus())
        .json(this.body(exception.code, exception.message));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ??
            exception.message);
      const code =
        status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : `HTTP_${status}`;
      response
        .status(status)
        .json(
          this.body(
            code,
            Array.isArray(message) ? message.join('; ') : message,
          ),
        );
      return;
    }

    // body-parser 之类在进入 Nest 之前抛出的 4xx（413/415 等）不是
    // HttpException，不能让它们落进 500 分支。
    const status = this.statusOf(exception);
    if (status !== null) {
      const message =
        status === HttpStatus.PAYLOAD_TOO_LARGE
          ? '请求体过大'
          : status === HttpStatus.UNSUPPORTED_MEDIA_TYPE
            ? '不支持的 Content-Type'
            : '请求无效';
      response.status(status).json(this.body(`HTTP_${status}`, message));
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(this.body('INTERNAL_ERROR', '服务器内部错误'));
  }

  private body(code: string, message: string): ErrorBody {
    return { error: { code, message } };
  }

  private statusOf(exception: unknown): number | null {
    if (typeof exception !== 'object' || exception === null) return null;
    const candidate = exception as { status?: unknown; statusCode?: unknown };
    const value = candidate.status ?? candidate.statusCode;
    return typeof value === 'number' && value >= 400 && value < 500
      ? value
      : null;
  }
}
