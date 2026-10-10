// ============================================================================
// FILE: /apps/api/src/modules/quotes/quotes.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './entities/quote.entity';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [TypeOrmModule.forFeature([Quote]), InvoicesModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
