import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 公开演示站：不暴露后端框架指纹。
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());

  const origin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: origin ? origin.split(',').map((item) => item.trim()) : true,
  });

  const port = Number(process.env.PORT ?? 3030);
  // 默认只监听本机：演示身份是请求头，不应该一启动就暴露到局域网。
  // 部署时显式设置 HOST=0.0.0.0。
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  console.log(`julai-case-server listening on http://${host}:${port}/api`);
}

void bootstrap();
