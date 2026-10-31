import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem } from '../catalog/entities/catalog-item.entity';
import { FeedListing } from './entities/feed-listing.entity';
import { SaveListingDto } from './dto/commerce-feeds.dto';
import {
  validateAvailability,
  validateBrand,
  validateCondition,
  validateCurrency,
  validateDescription,
  validateGtin,
  validateMpn,
  validateTitle,
  validateUrl,
} from './engine/shop-feed-engine';

// A feed listing is the marketing overlay a shop keeps for a catalog item
// before it goes to external channels. Saving again replaces the overlay
// completely, the same way marketplace re-syncs replace listing data.

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(FeedListing)
    private readonly listings: Repository<FeedListing>,
    @InjectRepository(CatalogItem)
    private readonly items: Repository<CatalogItem>,
  ) {}

  async saveListing(ownerUserId: string, dto: SaveListingDto): Promise<FeedListing> {
    const item = await this.items.findOne({
      where: { id: dto.itemId, userId: ownerUserId },
    });
    if (!item) throw new BadRequestException('feed-product-not-found');
    const title = validateTitle(dto.title);
    if (!title.ok) throw new BadRequestException(title.reason);
    const description = validateDescription(dto.description);
    if (!description.ok) throw new BadRequestException(description.reason);
    const imageUrl = validateUrl(dto.imageUrl);
    if (!imageUrl.ok) throw new BadRequestException(imageUrl.reason);
    const productUrl = validateUrl(dto.productUrl);
    if (!productUrl.ok) throw new BadRequestException(productUrl.reason);
    const availability = validateAvailability(dto.availability ?? 'in stock');
    if (!availability.ok) throw new BadRequestException(availability.reason);
    const condition = validateCondition(dto.condition ?? 'new');
    if (!condition.ok) throw new BadRequestException(condition.reason);
    const currency = validateCurrency(dto.currency ?? 'USD');
    if (!currency.ok) throw new BadRequestException(currency.reason);
    const brand = validateBrand(dto.brand);
    if (!brand.ok) throw new BadRequestException(brand.reason);
    const gtin = validateGtin(dto.gtin);
    if (!gtin.ok) throw new BadRequestException(gtin.reason);
    const mpn = validateMpn(dto.mpn);
    if (!mpn.ok) throw new BadRequestException(mpn.reason);
    const data = {
      userId: ownerUserId,
      itemId: dto.itemId,
      title: title.value,
      description: description.value,
      imageUrl: imageUrl.value,
      productUrl: productUrl.value,
      availability: availability.value,
      condition: condition.value,
      currency: currency.value,
      brand: brand.value ?? null,
      gtin: gtin.value ?? null,
      mpn: mpn.value ?? null,
    };
    const existing = await this.listings.findOne({
      where: { userId: ownerUserId, itemId: dto.itemId },
    });
    if (existing) {
      Object.assign(existing, data);
      return this.listings.save(existing);
    }
    return this.listings.save(
      this.listings.create({ ...data, createdAt: new Date() }),
    );
  }

  async listListings(ownerUserId: string): Promise<FeedListing[]> {
    return this.listings.find({ where: { userId: ownerUserId } });
  }
}
