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
}
