// ============================================================================
// FILE: /apps/api/src/modules/recurring/recurring.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringInvoiceProfile } from './entities/recurring-invoice-profile.entity';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [TypeOrmModule.forFeature([RecurringInvoiceProfile]), InvoicesModule],
  controllers: [RecurringController],
  providers: [RecurringService],
})
export class RecurringModule {}
