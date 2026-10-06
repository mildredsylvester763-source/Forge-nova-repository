// ============================================================================
// FILE: /apps/api/src/main.ts
// ============================================================================
// Bootstrap with the transport-level security baseline:
//   - helmet: hardened HTTP headers (HSTS, no sniffing, frame protection)
//   - CORS: only the declared client origin — not '*'
//   - Body caps: 1MB JSON — payloads are bounded, DoS-resistant by default
//   - Global prefix: /api/v1 — versioned from day one
//   - FAIL-FAST env validation: no secret, no boot.

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { validateEnv } from './common/env.validation';

async function bootstrap(): Promise<void> {
  validateEnv(process.env as unknown as Record<string, any>);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const clientUrl = process.env.CLIENT_URL || 'https://app.forge-nova.com';
  const isDev = process.env.NODE_ENV === 'development';

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: isDev ? true : clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.use(bodyCap());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log('FORGE Nova API listening on port ' + port + (isDev ? ' (development)' : ''));
}

// 1MB JSON body cap.
function bodyCap(): (req: any, res: any, next: any) => void {
  return (req: any, _res: any, next: any) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > 1024 * 1024) {
      const err: any = new Error('Payload too large');
      err.status = 413;
      return next(err);
    }
    next();
  };
}

bootstrap();
