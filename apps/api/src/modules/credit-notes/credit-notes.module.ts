// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/credit-notes.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditNote } from './entities/credit-note.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { CreditNotesService } from './credit-notes.service';
import { CreditNotesController } from './credit-notes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditNote, Invoice])],
  controllers: [CreditNotesController],
  providers: [CreditNotesService],
})
export class CreditNotesModule {}
