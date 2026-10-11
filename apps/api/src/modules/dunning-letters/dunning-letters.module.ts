// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/dunning-letters.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DunningLetter } from './entities/dunning-letter.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DunningLettersService } from './dunning-letters.service';
import { DunningLettersController } from './dunning-letters.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DunningLetter, Invoice])],
  controllers: [DunningLettersController],
  providers: [DunningLettersService],
  exports: [DunningLettersService],
})
export class DunningLettersModule {}
