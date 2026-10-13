// ============================================================================
// FILE: /apps/api/src/modules/customer-statements/customer-statements.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { CustomerStatementsController } from './customer-statements.controller';
import { CustomerStatementsService } from './customer-statements.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  controllers: [CustomerStatementsController],
  providers: [CustomerStatementsService],
})
export class CustomerStatementsModule {}
