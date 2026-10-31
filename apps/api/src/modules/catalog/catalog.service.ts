import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogVariant } from './entities/catalog-variant.entity';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { AssignBarcodeDto, CreateCatalogItemDto } from './dto/catalog.dto';
import { buildVariants, validateCatalogName, validateOptionSet } from './engine/variant-engine';
import { normalizeBarcode } from './engine/barcode-engine';

// Validation and grid math live in the engines. This service persists the
// parent item, every variant, and a real stock item per variant SKU so the
// catalog can never drift away from stock. Barcodes are unique per owner.
// Nothing is written until every check has passed.

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CatalogItem)
    private readonly itemRepository: Repository<CatalogItem>,
    @InjectRepository(CatalogVariant)
    private readonly variantRepository: Repository<CatalogVariant>,
    @InjectRepository(StockItem)
    private readonly stockRepository: Repository<StockItem>,
  ) {}

  async createCatalogItem(userId: string, dto: CreateCatalogItemDto) {
    const name = validateCatalogName(dto.name);
    if (!name.ok) throw new BadRequestException(name.reason);
    const options = validateOptionSet(dto.options);
    if (!options.ok) throw new BadRequestException(options.reason);
    const rawPrice = dto.unitPriceCents === undefined || dto.unitPriceCents === null ? 0 : dto.unitPriceCents;
    const plans = buildVariants(name.value, options.value, rawPrice);
    if (!plans.ok) throw new BadRequestException(plans.reason);

    for (const plan of plans.value) {
      const stockClash = await this.stockRepository.findOne({ where: { userId, sku: plan.sku }, withDeleted: true });
      if (stockClash) throw new ConflictException('sku-exists:' + plan.sku);
      const variantClash = await this.variantRepository.findOne({ where: { userId, sku: plan.sku } });
      if (variantClash) throw new ConflictException('variant-sku-exists:' + plan.sku);
    }

    const item = await this.itemRepository.save(
      this.itemRepository.create({
        userId,
        name: name.value,
        optionsJson: JSON.stringify(options.value),
      }),
    );

    const variants: CatalogVariant[] = [];
    const stockItems: StockItem[] = [];
    for (const plan of plans.value) {
      const variant = await this.variantRepository.save(
        this.variantRepository.create({
          userId,
          itemId: item.id,
          sku: plan.sku,
          optionValuesJson: JSON.stringify(plan.optionValues),
          unitPriceCents: plan.unitPriceCents,
        }),
      );
      variants.push(variant);
      const stock = await this.stockRepository.save(
        this.stockRepository.create({
          userId,
          sku: plan.sku,
          name: [name.value].concat(plan.optionValues).join(' '),
          onHand: 0,
        }),
      );
      stockItems.push(stock);
    }
    return { item, variants, stockItems };
  }

  async listItems(userId: string): Promise<CatalogItem[]> {
    return this.itemRepository.find({ where: { userId }, order: { name: 'ASC' } });
  }

  async variantsFor(userId: string, itemId: string): Promise<CatalogVariant[]> {
    const item = await this.itemRepository.findOne({ where: { userId, id: itemId } });
    if (!item) throw new NotFoundException('catalog-item-not-found');
    return this.variantRepository.find({ where: { userId, itemId }, order: { sku: 'ASC' } });
  }

  async assignBarcode(userId: string, variantId: string, dto: AssignBarcodeDto): Promise<CatalogVariant> {
    const barcode = normalizeBarcode(dto.barcode);
    if (!barcode.ok) throw new BadRequestException(barcode.reason);
    const variant = await this.variantRepository.findOne({ where: { userId, id: variantId } });
    if (!variant) throw new NotFoundException('catalog-variant-not-found');
    const clash = await this.variantRepository.findOne({ where: { userId, barcode: barcode.value } });
    if (clash && clash.id !== variant.id) throw new ConflictException('barcode-exists');
    variant.barcode = barcode.value;
    return this.variantRepository.save(variant);
  }

  async scan(userId: string, rawBarcode: string) {
    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode.ok) throw new BadRequestException(barcode.reason);
    const variant = await this.variantRepository.findOne({ where: { userId, barcode: barcode.value } });
    if (!variant) throw new NotFoundException('barcode-not-found');
    const stock = await this.stockRepository.findOne({ where: { userId, sku: variant.sku } });
    return {
      variantId: variant.id,
      sku: variant.sku,
      name: stock ? stock.name : variant.sku,
      onHand: stock ? stock.onHand : 0,
      unitPriceCents: variant.unitPriceCents,
      barcode: barcode.value,
    };
  }
}
