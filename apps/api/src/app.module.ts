// ============================================================================
// FILE: /apps/api/src/app.module.ts
// ============================================================================
// The root. Every feature module registers here. The global pipe enforces
// DTO validation on every request body; the global guard makes every route
// private unless marked @Public().

import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { validateEnv } from './common/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { ProductsModule } from './modules/products/products.module';
import { EgressModule } from './egress/egress.module';
import { GlobalAuthGuard } from './common/guards/global-auth.guard';
import { User } from './modules/auth/entities/user.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { Opportunity } from './modules/opportunities/entities/opportunity.entity';
import { OpportunityHistory } from './modules/opportunities/entities/opportunity-history.entity';
import { OpportunityScan } from './modules/opportunities/entities/opportunity-scan.entity';
import { Product } from './modules/products/entities/product.entity';
import { ProductHistory } from './modules/products/entities/product-history.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [configuration],
      validate: validateEnv,
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDevelopment = config.get<string>('nodeEnv') === 'development';
        return {
          type: 'postgres' as const,
          url: config.getOrThrow<string>('database.url'),
          entities: [
            User,
            RefreshToken,
            Opportunity,
            OpportunityHistory,
            OpportunityScan,
            Product,
            ProductHistory,
            Notification,
          ],
          synchronize: isDevelopment,
          logging: isDevelopment,
          maxQueryExecutionTime: 2000,
          poolSize: 10,
        };
      },
    }),

    AuthModule,
    OpportunitiesModule,
    ProductsModule,
    NotificationsModule,
    EgressModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
  ],
})
export class AppModule {}
