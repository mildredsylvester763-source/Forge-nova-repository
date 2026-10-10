// ============================================================================
// FILE: /apps/api/src/modules/accounting/accounting.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerAccount } from './entities/ledger-account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerAccount, JournalEntry, Invoice, CreditNote])],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
