// ============================================================================
// FILE: /apps/api/src/modules/finance/finance.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductHistory } from '../products/entities/product-history.entity';
import { Product } from '../products/entities/product.entity';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductHistory, Product])],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
