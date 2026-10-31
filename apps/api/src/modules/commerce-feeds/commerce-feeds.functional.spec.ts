// ============================================================================
// FILE: /apps/api/src/modules/commerce-feeds/commerce-feeds.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL ListingsService and CommerceFeedsService
// wired to the shared in-memory repository helper. Multi-user reality: full
// overlay upserts, per-owner isolation on every listing, plan and feed row,
// named refusals with zero side effects, honest 'planned' sync snapshots and
// honest 'recorded' Google feeds with named skips. No fake sends anywhere.

import { CommerceFeedsService } from './commerce-feeds.service';
import { ListingsService } from './listings.service';
import { CatalogItem } from '../catalog/entities/catalog-item.entity';
import { CatalogVariant } from '../catalog/entities/catalog-variant.entity';
import { FeedListing } from './entities/feed-listing.entity';
import { ShopSyncPlan } from './entities/shop-sync-plan.entity';
import { ShoppingFeedRecord } from './entities/shopping-feed-record.entity';
import { fakeRepo } from '../../common/testing/fake-repository';

interface Harness {
  listings: ListingsService;
  feedsService: CommerceFeedsService;
  listingRows: FeedListing[];
  planRows: ShopSyncPlan[];
  feedRows: ShoppingFeedRecord[];
  itemRows: CatalogItem[];
  variantRows: CatalogVariant[];
}

function buildHarness(): Harness {
  const listings = fakeRepo<FeedListing>();
  const plans = fakeRepo<ShopSyncPlan>();
  const feeds = fakeRepo<ShoppingFeedRecord>();
  const items = fakeRepo<CatalogItem>();
  const variants = fakeRepo<CatalogVariant>();
  return {
    listings: new ListingsService(listings.repo, items.repo),
    feedsService: new CommerceFeedsService(
      listings.repo,
      plans.repo,
      feeds.repo,
      items.repo,
      variants.repo,
    ),
    listingRows: listings.rows,
    planRows: plans.rows,
    feedRows: feeds.rows,
    itemRows: items.rows,
    variantRows: variants.rows,
  };
}

function seedItem(h: Harness, id: string, userId: string, name: string): void {
  h.itemRows.push({ id, userId, name, optionsJson: '[]', createdAt: new Date() } as CatalogItem);
}

function seedVariant(
  h: Harness,
  id: string,
  userId: string,
  itemId: string,
  sku: string,
  unitPriceCents: number,
): void {
  h.variantRows.push({
    id,
    userId,
    itemId,
    sku,
    optionValuesJson: '[]',
    barcode: null,
    unitPriceCents,
    createdAt: new Date(),
  } as CatalogVariant);
}

const LISTING = {
  title: 'Red hat',
  description: 'A warm red hat',
  imageUrl: 'https://shop.example/hat.jpg',
  productUrl: 'https://shop.example/hat',
};

describe('listings functional flows', () => {
  it('saves a listing and re-saves update the SAME row as a full overlay', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    seedVariant(h, 'var-1', 'owner-a', 'item-1', 'HAT-RED', 1299);
    const first = await h.listings.saveListing('owner-a', {
      itemId: 'item-1',
      ...LISTING,
      brand: 'Acme',
    });
    expect(h.listingRows.length).toBe(1);
    expect(first.brand).toBe('Acme');
    expect(first.availability).toBe('in stock');
    expect(first.condition).toBe('new');
    expect(first.currency).toBe('USD');
    const second = await h.listings.saveListing('owner-a', {
      itemId: 'item-1',
      title: 'Red hat v2',
      description: 'Still warm',
      imageUrl: 'https://shop.example/hat2.jpg',
      productUrl: 'https://shop.example/hat2',
      availability: 'out of stock',
    });
    expect(h.listingRows.length).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Red hat v2');
    expect(second.availability).toBe('out of stock');
    expect(second.brand).toBeNull();
  });

  it('refuses a listing for an unknown product and leaves zero rows', async () => {
    const h = buildHarness();
    await expect(
      h.listings.saveListing('owner-a', { itemId: 'item-x', ...LISTING }),
    ).rejects.toThrow('feed-product-not-found');
    expect(h.listingRows.length).toBe(0);
  });

  it('refuses invalid availability and non-https URLs by name with zero rows', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    await expect(
      h.listings.saveListing('owner-a', {
        itemId: 'item-1',
        ...LISTING,
        availability: 'sometimes',
      }),
    ).rejects.toThrow('feed-invalid-availability');
    await expect(
      h.listings.saveListing('owner-a', {
        itemId: 'item-1',
        ...LISTING,
        imageUrl: 'http://shop.example/hat.jpg',
      }),
    ).rejects.toThrow('feed-invalid-url');
    expect(h.listingRows.length).toBe(0);
  });

  it('isolates listings per owner: nobody can list a foreign item', async () => {
    const h = buildHarness();
    seedItem(h, 'item-a', 'owner-a', 'Hat');
    seedItem(h, 'item-b', 'owner-b', 'Bag');
    await expect(
      h.listings.saveListing('owner-b', { itemId: 'item-a', ...LISTING }),
    ).rejects.toThrow('feed-product-not-found');
    await h.listings.saveListing('owner-a', { itemId: 'item-a', ...LISTING });
    await h.listings.saveListing('owner-b', {
      itemId: 'item-b',
      title: 'Leather bag',
      description: 'A bag',
      imageUrl: 'https://shop.example/bag.jpg',
      productUrl: 'https://shop.example/bag',
    });
    const listA = await h.listings.listListings('owner-a');
    const listB = await h.listings.listListings('owner-b');
    expect(listA.length).toBe(1);
    expect(listA[0].userId).toBe('owner-a');
    expect(listB.length).toBe(1);
    expect(listB[0].userId).toBe('owner-b');
  });
});

describe('shop sync functional flows', () => {
  it('plans an honest sync with the exact Meta catalog payload per variant', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    seedVariant(h, 'var-1', 'owner-a', 'item-1', 'HAT-RED', 1299);
    seedVariant(h, 'var-2', 'owner-a', 'item-1', 'HAT-BLUE', 1500);
    await h.listings.saveListing('owner-a', {
      itemId: 'item-1',
      title: 'Red hat v2',
      description: 'Still warm',
      imageUrl: 'https://shop.example/hat2.jpg',
      productUrl: 'https://shop.example/hat2',
      brand: 'Acme',
    });
    const plan1 = await h.feedsService.planShopSync('owner-a', 'instagram', 'var-1');
    expect(plan1.status).toBe('planned');
    expect(plan1.sku).toBe('HAT-RED');
    expect(plan1.payload).toEqual({
      retailer_id: 'HAT-RED',
      item_group_id: 'item-1',
      title: 'Red hat v2',
      description: 'Still warm',
      price: { amount: '12.99', currency: 'USD' },
      availability: 'in stock',
      condition: 'new',
      image_url: 'https://shop.example/hat2.jpg',
      link: 'https://shop.example/hat2',
      brand: 'Acme',
    });
    const plan2 = await h.feedsService.planShopSync('owner-a', 'facebook', 'var-2');
    expect(plan2.payload.retailer_id).toBe('HAT-BLUE');
    expect(h.planRows.length).toBe(2);
    const syncs = await h.feedsService.listShopSyncs('owner-a');
    expect(syncs.length).toBe(2);
    const fbSyncs = await h.feedsService.listShopSyncs('owner-a', 'facebook');
    expect(fbSyncs.length).toBe(1);
    expect(fbSyncs[0].channel).toBe('facebook');
  });

  it('refuses syncs for unknown channels, unknown variants and missing listings', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    seedVariant(h, 'var-1', 'owner-a', 'item-1', 'HAT-RED', 1299);
    seedItem(h, 'item-2', 'owner-a', 'Unlisted');
    seedVariant(h, 'var-3', 'owner-a', 'item-2', 'UNL-1', 999);
    await expect(h.feedsService.planShopSync('owner-a', 'tiktok', 'var-1')).rejects.toThrow(
      'feed-unknown-channel',
    );
    await expect(h.feedsService.planShopSync('owner-a', 'facebook', 'var-x')).rejects.toThrow(
      'feed-variant-not-found',
    );
    await expect(h.feedsService.planShopSync('owner-a', 'facebook', 'var-3')).rejects.toThrow(
      'feed-listing-missing',
    );
    expect(h.planRows.length).toBe(0);
  });

  it('refuses a sync for a zero priced variant and a foreign variant', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    seedVariant(h, 'var-1', 'owner-a', 'item-1', 'HAT-RED', 1299);
    seedItem(h, 'item-d', 'owner-a', 'Free');
    seedVariant(h, 'var-4', 'owner-a', 'item-d', 'FREE-1', 0);
    await h.listings.saveListing('owner-a', { itemId: 'item-d', ...LISTING });
    await expect(h.feedsService.planShopSync('owner-a', 'facebook', 'var-4')).rejects.toThrow(
      'feed-invalid-price',
    );
    await expect(h.feedsService.planShopSync('owner-b', 'facebook', 'var-1')).rejects.toThrow(
      'feed-variant-not-found',
    );
    expect(h.planRows.length).toBe(0);
  });
});

describe('google feed functional flows', () => {
  it('generates an honest feed with named skips and nothing faked as sent', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    seedVariant(h, 'var-1', 'owner-a', 'item-1', 'HAT-RED', 1299);
    seedVariant(h, 'var-2', 'owner-a', 'item-1', 'HAT-BLUE', 1500);
    await h.listings.saveListing('owner-a', {
      itemId: 'item-1',
      title: 'Red hat v2',
      description: 'Still warm',
      imageUrl: 'https://shop.example/hat2.jpg',
      productUrl: 'https://shop.example/hat2',
      brand: 'Acme',
    });
    seedItem(h, 'item-d', 'owner-a', 'Free thing');
    seedVariant(h, 'var-4', 'owner-a', 'item-d', 'FREE-1', 0);
    await h.listings.saveListing('owner-a', { itemId: 'item-d', ...LISTING });
    seedItem(h, 'item-e', 'owner-a', 'No variants yet');
    await h.listings.saveListing('owner-a', { itemId: 'item-e', ...LISTING });

    const feed = await h.feedsService.generateGoogleFeed('owner-a');
    expect(feed.status).toBe('recorded');
    expect(feed.itemCount).toBe(2);
    const sorted = feed.skipped.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(sorted).toEqual([
      { id: 'FREE-1', reason: 'feed-invalid-price' },
      { id: 'item-e', reason: 'feed-variant-missing' },
    ]);
    expect(feed.xml).toContain('<g:id>HAT-RED</g:id>');
    expect(feed.xml).toContain('<g:id>HAT-BLUE</g:id>');
    expect(feed.xml).toContain('<g:title>Red hat v2</g:title>');
    expect(feed.xml).toContain('<g:price>12.99 USD</g:price>');
    expect(feed.xml).toContain('<g:brand>Acme</g:brand>');
    expect(feed.xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(h.feedRows.length).toBe(1);
  });

  it('marks identifier-less listings as custom goods in the feed', async () => {
    const h = buildHarness();
    seedItem(h, 'item-b', 'owner-b', 'Bag');
    seedVariant(h, 'var-b', 'owner-b', 'item-b', 'BAG-1', 2500);
    await h.listings.saveListing('owner-b', {
      itemId: 'item-b',
      title: 'Leather bag',
      description: 'A bag',
      imageUrl: 'https://shop.example/bag.jpg',
      productUrl: 'https://shop.example/bag',
    });
    const feed = await h.feedsService.generateGoogleFeed('owner-b');
    expect(feed.itemCount).toBe(1);
    expect(feed.xml).toContain('<g:id>BAG-1</g:id>');
    expect(feed.xml).toContain('<g:identifier_exists>false</g:identifier_exists>');
    expect(feed.xml).not.toContain('<g:brand>');
  });

  it('refuses a google feed when the owner has nothing valid and stores no row', async () => {
    const h = buildHarness();
    await expect(h.feedsService.generateGoogleFeed('owner-z')).rejects.toThrow(
      'feed-no-valid-items',
    );
    expect(h.feedRows.length).toBe(0);
  });

  it('isolates plans and feeds per owner', async () => {
    const h = buildHarness();
    seedItem(h, 'item-1', 'owner-a', 'Hat');
    seedVariant(h, 'var-1', 'owner-a', 'item-1', 'HAT-RED', 1299);
    await h.listings.saveListing('owner-a', { itemId: 'item-1', ...LISTING });
    await h.feedsService.planShopSync('owner-a', 'facebook', 'var-1');
    await h.feedsService.generateGoogleFeed('owner-a');
    seedItem(h, 'item-b', 'owner-b', 'Bag');
    seedVariant(h, 'var-b', 'owner-b', 'item-b', 'BAG-1', 2500);
    await h.listings.saveListing('owner-b', {
      itemId: 'item-b',
      title: 'Leather bag',
      description: 'A bag',
      imageUrl: 'https://shop.example/bag.jpg',
      productUrl: 'https://shop.example/bag',
    });
    await h.feedsService.generateGoogleFeed('owner-b');
    const feedsA = await h.feedsService.listFeeds('owner-a');
    const feedsB = await h.feedsService.listFeeds('owner-b');
    expect(feedsA.length).toBe(1);
    expect(feedsA[0].userId).toBe('owner-a');
    expect(feedsB.length).toBe(1);
    expect(feedsB[0].userId).toBe('owner-b');
    const syncsB = await h.feedsService.listShopSyncs('owner-b');
    expect(syncsB.length).toBe(0);
    expect(h.feedRows.length).toBe(2);
  });
});
