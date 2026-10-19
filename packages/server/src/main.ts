import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());

  const origin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: origin ? origin.split(',').map((item) => item.trim()) : true,
  });

  const port = Number(process.env.PORT ?? 3030);
  await app.listen(port);
  console.log(`julai-case-server listening on http://127.0.0.1:${port}/api`);
}

void bootstrap();
