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
import { Quote } from './modules/quotes/entities/quote.entity';
import { QuotesModule } from './modules/quotes/quotes.module';
import { LedgerAccount } from './modules/accounting/entities/ledger-account.entity';
import { JournalEntry } from './modules/accounting/entities/journal-entry.entity';
import { AccountingModule } from './modules/accounting/accounting.module';
import { PaymentLink } from './modules/payment-links/entities/payment-link.entity';
import { PaymentLinksModule } from './modules/payment-links/payment-links.module';
import { DunningLetter } from './modules/dunning-letters/entities/dunning-letter.entity';
import { DunningLettersModule } from './modules/dunning-letters/dunning-letters.module';
import { AccountingPeriod } from './modules/accounting/entities/accounting-period.entity';
import { Payment } from './modules/payments/entities/payment.entity';
import { Receipt } from './modules/receipts/entities/receipt.entity';
import { Expense } from './modules/expenses/entities/expense.entity';
import { Contact } from './modules/contacts/entities/contact.entity';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CustomerStatementsModule } from './modules/customer-statements/customer-statements.module';
import { AgentCommand } from './modules/agent/entities/agent-command.entity';
import { AgentModule } from './modules/agent/agent.module';
import { Budget } from './modules/budgets/entities/budget.entity';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { TaxRecord } from './modules/taxes/entities/tax-record.entity';
import { TaxesModule } from './modules/taxes/taxes.module';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { AuditModule } from './modules/audit/audit.module';
import { Activity } from './modules/crm-activities/entities/activity.entity';
import { ActivitiesModule } from './modules/crm-activities/activities.module';
import { StockItem } from './modules/inventory/entities/stock-item.entity';
import { StockMovement } from './modules/inventory/entities/stock-movement.entity';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ApiKey } from './modules/integrations/entities/api-key.entity';
import { WebhookEndpoint } from './modules/integrations/entities/webhook-endpoint.entity';
import { WebhookDelivery } from './modules/integrations/entities/webhook-delivery.entity';
import { Integration } from './modules/integrations/entities/integration.entity';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { EgressConnection } from './modules/egress-universal/entities/egress-connection.entity';
import { EgressCallLog } from './modules/egress-universal/entities/egress-call-log.entity';
import { EgressQuota } from './modules/egress-universal/entities/egress-quota.entity';
import { EgressOauthSession } from './modules/egress-universal/entities/egress-oauth-session.entity';
import { TrainingAsset } from './modules/ai-training/entities/training-asset.entity';
import { TrainingDataset } from './modules/ai-training/entities/training-dataset.entity';
import { TrainingRun } from './modules/ai-training/entities/training-run.entity';
import { LoyaltyAccount } from './modules/loyalty/entities/loyalty-account.entity';
import { LoyaltyEvent } from './modules/loyalty/entities/loyalty-event.entity';
import { ReferralCode } from './modules/referrals/entities/referral-code.entity';
import { ReferralBinding } from './modules/referrals/entities/referral-binding.entity';
import { ReferralReward } from './modules/referrals/entities/referral-reward.entity';
import { AiTrainingModule } from './modules/ai-training/ai-training.module';
import { EgressUniversalModule } from './modules/egress-universal/egress-universal.module';
import { SystemModule } from './modules/system/system.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { ReferralsModule } from './modules/referrals/referrals.module';

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
            Quote,
            LedgerAccount,
            JournalEntry,
            PaymentLink,
            DunningLetter,
            AccountingPeriod,
            Payment,
            Receipt,
            Expense,
            Contact,
            AgentCommand,
            Budget,
            TaxRecord,
            AuditLog,
            Activity,
            StockItem,
            StockMovement,
            ApiKey,
            WebhookEndpoint,
            WebhookDelivery,
            Integration,
            EgressConnection,
            EgressCallLog,
            EgressQuota,
            EgressOauthSession,
            TrainingAsset,
            TrainingDataset,
            TrainingRun,
            LoyaltyAccount,
            LoyaltyEvent,
            ReferralCode,
            ReferralBinding,
            ReferralReward,
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
    QuotesModule,
    AccountingModule,
    PaymentLinksModule,
    DunningLettersModule,
    PaymentsModule,
    ReceiptsModule,
    ExpensesModule,
    ContactsModule,
    CustomerStatementsModule,
    AgentModule,
    BudgetsModule,
    TaxesModule,
    AuditModule,
    ActivitiesModule,
    InventoryModule,
    IntegrationsModule,
    EgressUniversalModule,
    AiTrainingModule,
    SystemModule,
    LoyaltyModule,
    ReferralsModule,
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
