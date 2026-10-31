import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehousingController } from './warehousing.controller';
import { LocationsService } from './locations.service';
import { BatchesService } from './batches.service';
import { StockLocation } from './entities/stock-location.entity';
import { LocationStock } from './entities/location-stock.entity';
import { StockBatch } from './entities/stock-batch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StockLocation, LocationStock, StockBatch])],
  controllers: [WarehousingController],
  providers: [LocationsService, BatchesService],
})
export class WarehousingModule {}
