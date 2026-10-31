import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogVariant } from './entities/catalog-variant.entity';
import { StockItem } from '../inventory/entities/stock-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogItem, CatalogVariant, StockItem])],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
