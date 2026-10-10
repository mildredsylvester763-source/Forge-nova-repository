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
import { Experiment } from './modules/experiments/entities/experiment.entity';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { Pattern } from './modules/patterns/entities/pattern.entity';
import { PatternsModule } from './modules/patterns/patterns.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { TimeBudget } from './modules/time-budget/entities/time-budget.entity';
import { TimeBudgetModule } from './modules/time-budget/time-budget.module';
import { GeoModule } from './modules/geo/geo.module';
import { SeasonalModule } from './modules/seasonal/seasonal.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { CompetitionModule } from './modules/competition/competition.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { RegulatoryModule } from './modules/regulatory/regulatory.module';
import { InsightsModule } from './modules/insights/insights.module';
import { FinanceModule } from './modules/finance/finance.module';
import { BlueOceanModule } from './modules/blue-ocean/blue-ocean.module';
import { Invoice } from './modules/invoices/entities/invoice.entity';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { RecurringInvoiceProfile } from './modules/recurring/entities/recurring-invoice-profile.entity';
import { RecurringModule } from './modules/recurring/recurring.module';
import { CreditNote } from './modules/credit-notes/entities/credit-note.entity';
import { CreditNotesModule } from './modules/credit-notes/credit-notes.module';

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
            Experiment,
            Pattern,
            TimeBudget,
            Invoice,
            RecurringInvoiceProfile,
            CreditNote,
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
    ExperimentsModule,
    PatternsModule,
    PortfolioModule,
    TimeBudgetModule,
    GeoModule,
    SeasonalModule,
    AlertsModule,
    CompetitionModule,
    PricingModule,
    RegulatoryModule,
    InsightsModule,
    FinanceModule,
    BlueOceanModule,
    InvoicesModule,
    RecurringModule,
    CreditNotesModule,
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
