import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem } from '../catalog/entities/catalog-item.entity';
import { CatalogVariant } from '../catalog/entities/catalog-variant.entity';
import { FeedListing } from './entities/feed-listing.entity';
import { ShopSyncPlan } from './entities/shop-sync-plan.entity';
import { ShoppingFeedRecord } from './entities/shopping-feed-record.entity';
import {
  buildMetaCatalogItem,
  buildShoppingFeedXml,
  planGoogleFeed,
  validateChannel,
} from './engine/shop-feed-engine';

// Shop syncs and Google feeds are HONEST records. There is no Meta or Google
// adapter in the system yet, so nothing pretends to be sent anywhere: a
// sync plan stores the exact catalog item payload that would be submitted
// with status 'planned', and a generated feed stores the exact RSS 2.0 XML
// with status 'recorded' plus the named reason every skipped candidate was
// left out.

@Injectable()
export class CommerceFeedsService {
  constructor(
    @InjectRepository(FeedListing)
    private readonly listings: Repository<FeedListing>,
    @InjectRepository(ShopSyncPlan)
    private readonly plans: Repository<ShopSyncPlan>,
    @InjectRepository(ShoppingFeedRecord)
    private readonly feeds: Repository<ShoppingFeedRecord>,
    @InjectRepository(CatalogItem)
    private readonly items: Repository<CatalogItem>,
    @InjectRepository(CatalogVariant)
    private readonly variants: Repository<CatalogVariant>,
  ) {}

  async planShopSync(
    ownerUserId: string,
    rawChannel: string,
    variantId: string,
  ): Promise<ShopSyncPlan> {
    const channel = validateChannel(rawChannel);
    if (!channel.ok) throw new BadRequestException(channel.reason);
    const variant = await this.variants.findOne({
      where: { id: variantId, userId: ownerUserId },
    });
    if (!variant) throw new BadRequestException('feed-variant-not-found');
    const item = await this.items.findOne({
      where: { id: variant.itemId, userId: ownerUserId },
    });
    if (!item) throw new BadRequestException('feed-product-not-found');
    const listing = await this.listings.findOne({
      where: { userId: ownerUserId, itemId: item.id },
    });
    if (!listing) throw new BadRequestException('feed-listing-missing');
    const verdict = buildMetaCatalogItem({
      channel: channel.value,
      sku: variant.sku,
      itemGroupId: item.id,
      title: listing.title,
      description: listing.description,
      currency: listing.currency,
      priceCents: variant.unitPriceCents,
      availability: listing.availability,
      condition: listing.condition,
      imageUrl: listing.imageUrl,
      productUrl: listing.productUrl,
      brand: listing.brand,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return this.plans.save(
      this.plans.create({
        userId: ownerUserId,
        channel: channel.value,
        itemId: item.id,
        variantId: variant.id,
        sku: variant.sku,
        payload: verdict.value,
        status: 'planned',
        createdAt: new Date(),
      }),
    );
  }

  async listShopSyncs(ownerUserId: string, channel?: string): Promise<ShopSyncPlan[]> {
    if (channel) {
      return this.plans.find({ where: { userId: ownerUserId, channel } });
    }
    return this.plans.find({ where: { userId: ownerUserId } });
  }

  async generateGoogleFeed(ownerUserId: string): Promise<ShoppingFeedRecord> {
    const listings = await this.listings.find({
      where: { userId: ownerUserId },
    });
    const candidates: { id: string; input: Record<string, unknown> }[] = [];
    const mySkipped: { id: string; reason: string }[] = [];
    for (const listing of listings) {
      const item = await this.items.findOne({
        where: { id: listing.itemId, userId: ownerUserId },
      });
      if (!item) {
        mySkipped.push({ id: listing.itemId, reason: 'feed-product-missing' });
        continue;
      }
      const variants = await this.variants.find({
        where: { userId: ownerUserId, itemId: item.id },
      });
      if (variants.length < 1) {
        mySkipped.push({ id: listing.itemId, reason: 'feed-variant-missing' });
        continue;
      }
      const hasIdentifiers = Boolean(listing.brand) || Boolean(listing.gtin) || Boolean(listing.mpn);
      for (const variant of variants) {
        candidates.push({
          id: variant.sku,
          input: {
            id: variant.sku,
            title: listing.title,
            description: listing.description,
            link: listing.productUrl,
            imageLink: listing.imageUrl,
            currency: listing.currency,
            priceCents: variant.unitPriceCents,
            availability: listing.availability,
            condition: listing.condition,
            brand: listing.brand,
            gtin: listing.gtin,
            mpn: listing.mpn,
            identifierExists: hasIdentifiers ? true : false,
          },
        });
      }
    }
    const plan = planGoogleFeed(candidates);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    const skipped = [...mySkipped, ...plan.value.skipped];
    const xml = buildShoppingFeedXml({
      title: 'Product feed',
      generatedAtIso: new Date().toISOString(),
      entries: plan.value.entries,
    });
    return this.feeds.save(
      this.feeds.create({
        userId: ownerUserId,
        xml,
        itemCount: plan.value.entries.length,
        skipped,
        status: 'recorded',
        createdAt: new Date(),
      }),
    );
  }

  async listFeeds(ownerUserId: string): Promise<ShoppingFeedRecord[]> {
    return this.feeds.find({ where: { userId: ownerUserId } });
  }
}
