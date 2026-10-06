// ============================================================================
// FILE: /apps/api/src/modules/products/products.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductHistory } from './entities/product-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductHistory])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
