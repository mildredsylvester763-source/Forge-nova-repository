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
import { BirthdaysModule } from './modules/birthdays/birthdays.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { Birthday } from './modules/birthdays/entities/birthday.entity';
import { BirthdayOutbox } from './modules/birthdays/entities/birthday-outbox.entity';
import { ReviewRequest } from './modules/reviews/entities/review-request.entity';
import { ReviewResponse } from './modules/reviews/entities/review-response.entity';
import { CustomerCredit } from './modules/credit-limits/entities/customer-credit.entity';
import { CreditEvent } from './modules/credit-limits/entities/credit-event.entity';
import { PortalSession } from './modules/portal/entities/portal-session.entity';
import { PortalVisit } from './modules/portal/entities/portal-visit.entity';
import { NpsResponse } from './modules/customer-health/entities/nps-response.entity';
import { ChurnAssessment } from './modules/customer-health/entities/churn-assessment.entity';
import { CreditLimitsModule } from './modules/credit-limits/credit-limits.module';
import { PortalModule } from './modules/portal/portal.module';
import { CustomerHealthModule } from './modules/customer-health/customer-health.module';
import { Supplier } from './modules/purchasing/entities/supplier.entity';
import { PurchaseOrder } from './modules/purchasing/entities/purchase-order.entity';
import { PurchaseOrderLine } from './modules/purchasing/entities/purchase-order-line.entity';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { CatalogItem } from './modules/catalog/entities/catalog-item.entity';
import { CatalogVariant } from './modules/catalog/entities/catalog-variant.entity';
import { CatalogModule } from './modules/catalog/catalog.module';
import { StockLocation } from './modules/warehousing/entities/stock-location.entity';
import { LocationStock } from './modules/warehousing/entities/location-stock.entity';
import { StockBatch } from './modules/warehousing/entities/stock-batch.entity';
import { WarehousingModule } from './modules/warehousing/warehousing.module';
import { ItemCost } from './modules/stock-insights/entities/item-cost.entity';
import { CostReceipt } from './modules/stock-insights/entities/cost-receipt.entity';
import { LowStockAlert } from './modules/stock-insights/entities/low-stock-alert.entity';
import { StockInsightsModule } from './modules/stock-insights/stock-insights.module';
import { DamagedGoodsLog } from './modules/goods-tracking/entities/damaged-goods-log.entity';
import { Consignor } from './modules/goods-tracking/entities/consignor.entity';
import { ConsignmentLot } from './modules/goods-tracking/entities/consignment-lot.entity';
import { ConsignmentEvent } from './modules/goods-tracking/entities/consignment-event.entity';
import { GoodsTrackingModule } from './modules/goods-tracking/goods-tracking.module';
import { Site } from './modules/websites/entities/site.entity';
import { SitePage } from './modules/websites/entities/site-page.entity';
import { SiteDomain } from './modules/websites/entities/site-domain.entity';
import { WebsitesModule } from './modules/websites/websites.module';
import { Post } from './modules/content/entities/post.entity';
import { Subscriber } from './modules/content/entities/subscriber.entity';
import { NewsletterIssue } from './modules/content/entities/newsletter-issue.entity';
import { SeoAudit } from './modules/content/entities/seo-audit.entity';
import { ContentModule } from './modules/content/content.module';
import { SocialPost } from './modules/social/entities/social-post.entity';
import { SocialModule } from './modules/social/social.module';
import { FeedListing } from './modules/commerce-feeds/entities/feed-listing.entity';
import { ShopSyncPlan } from './modules/commerce-feeds/entities/shop-sync-plan.entity';
import { ShoppingFeedRecord } from './modules/commerce-feeds/entities/shopping-feed-record.entity';
import { CommerceFeedsModule } from './modules/commerce-feeds/commerce-feeds.module';

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
            LoyaltyAccount,
            LoyaltyEvent,
            ReferralCode,
            ReferralBinding,
            ReferralReward,
            Birthday,
            BirthdayOutbox,
            ReviewRequest,
            ReviewResponse,
            CustomerCredit,
            CreditEvent,
            PortalSession,
            PortalVisit,
            NpsResponse,
            ChurnAssessment,
            Supplier,
            PurchaseOrder,
            PurchaseOrderLine,
            CatalogItem,
            CatalogVariant,
            StockLocation,
            LocationStock,
            StockBatch,
            ItemCost,
            CostReceipt,
            LowStockAlert,
            DamagedGoodsLog,
            Consignor,
            ConsignmentLot,
            ConsignmentEvent,
            Site,
            SitePage,
            SiteDomain,
            Post,
            Subscriber,
            NewsletterIssue,
            SeoAudit,
            SocialPost,
            FeedListing,
            ShopSyncPlan,
            ShoppingFeedRecord,
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
    BirthdaysModule,
    ReviewsModule,
    CreditLimitsModule,
    PortalModule,
    CustomerHealthModule,
    PurchasingModule,
    CatalogModule,
    WarehousingModule,
    StockInsightsModule,
    GoodsTrackingModule,
    WebsitesModule,
    ContentModule,
    SocialModule,
    CommerceFeedsModule,
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
