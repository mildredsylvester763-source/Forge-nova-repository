// ============================================================================
// FILE: /apps/api/src/modules/payment-links/payment-links.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentLink } from './entities/payment-link.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { PaymentLinksService } from './payment-links.service';
import { PaymentLinksController } from './payment-links.controller';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentLink, Invoice]), InvoicesModule],
  controllers: [PaymentLinksController],
  providers: [PaymentLinksService],
})
export class PaymentLinksModule {}
