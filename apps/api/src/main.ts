// ============================================================================
// FILE: /apps/api/src/main.ts
// ============================================================================
// Bootstrap with the transport-level security baseline:
//   - helmet: hardened HTTP headers (HSTS, no sniffing, frame protection)
//   - CORS: only the declared client origin — not '*'
//   - Body caps: 1MB JSON/urlencoded, enforced by the body parser itself
//   - Global prefix: /api/v1 — versioned from day one
// DTO validation is registered once, in AppModule (APP_PIPE).

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const clientUrl = config.getOrThrow<string>('clientUrl');
  const isDev = config.get<string>('nodeEnv') === 'development';

  app.use(helmet());
  app.use(compression());

  // Bounded request bodies. Nest's default parser caps at 100kb; this sets
  // the intended 1MB ceiling on the parser that actually reads the stream
  // (a Content-Length check would not stop chunked uploads).
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });

  app.enableCors({
    origin: isDev ? true : clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  new Logger('Bootstrap').log('FORGE Nova API listening on port ' + port + (isDev ? ' (development)' : ''));
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal: API failed to start', error);
  process.exit(1);
});
