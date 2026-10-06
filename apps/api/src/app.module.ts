// ============================================================================
// FILE: /apps/api/src/app.module.ts
// ============================================================================
// The root. Every feature module registers here. Global pipes enforce
// validation on every request body; global filters turn failures into
// consistent JSON; the auth guard is exported for controllers.

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_PIPE, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { ProductsModule } from './modules/products/products.module';
import { EgressModule } from './egress/egress.module';
import { User } from './modules/auth/entities/user.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { Opportunity } from './modules/opportunities/entities/opportunity.entity';
import { OpportunityHistory } from './modules/opportunities/entities/opportunity-history.entity';
import { OpportunityScan } from './modules/opportunities/entities/opportunity-scan.entity';
import { Product } from './modules/products/entities/product.entity';
import { ProductHistory } from './modules/products/entities/product-history.entity';

@Module({
  imports: [
    // Environment configuration — secrets come from env, never from code.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('database.url'),
        entities: [
          User,
          RefreshToken,
          Opportunity,
          OpportunityHistory,
          OpportunityScan,
          Product,
          ProductHistory,
        ],
        // No auto-sync in production: migrations only. Schema changes are
        // deliberate, versioned, and reversible.
        synchronize: config.get<string>('nodeEnv') === 'development',
        logging: config.get<string>('nodeEnv') === 'development',
        maxQueryExecutionTime: 2000,
        poolSize: 10,
      }),
    }),

    AuthModule,
    OpportunitiesModule,
    ProductsModule,
    EgressModule,
  ],
  providers: [
    // Validate EVERY request body globally — DTOs are the contract.
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }) },
  ],
})
export class AppModule {}
