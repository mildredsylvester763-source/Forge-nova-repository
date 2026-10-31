import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogItem } from '../catalog/entities/catalog-item.entity';
import { CatalogVariant } from '../catalog/entities/catalog-variant.entity';
import { FeedListing } from './entities/feed-listing.entity';
import { ShopSyncPlan } from './entities/shop-sync-plan.entity';
import { ShoppingFeedRecord } from './entities/shopping-feed-record.entity';
import { CommerceFeedsController } from './commerce-feeds.controller';
import { CommerceFeedsService } from './commerce-feeds.service';
import { ListingsService } from './listings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedListing,
      ShopSyncPlan,
      ShoppingFeedRecord,
      CatalogItem,
      CatalogVariant,
    ]),
  ],
  controllers: [CommerceFeedsController],
  providers: [ListingsService, CommerceFeedsService],
  exports: [ListingsService, CommerceFeedsService],
})
export class CommerceFeedsModule {}
