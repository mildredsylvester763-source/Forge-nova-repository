import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockLocation } from './entities/stock-location.entity';
import { LocationStock } from './entities/location-stock.entity';
import { CreateLocationDto, ReceiveStockDto, TransferStockDto } from './dto/warehousing.dto';
import { planStockReceipt, planStockTransfer, validateLocationName, validateStockSku } from './engine/location-engine';

// Location rules live in the engine. This service checks ownership,
// refuses duplicate location names per owner, and persists planned
// receipts and transfers. A refused transfer changes nothing anywhere.

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(StockLocation)
    private readonly locationRepository: Repository<StockLocation>,
    @InjectRepository(LocationStock)
    private readonly stockRepository: Repository<LocationStock>,
  ) {}

  async createLocation(userId: string, dto: CreateLocationDto): Promise<StockLocation> {
    const name = validateLocationName(dto.name);
    if (!name.ok) throw new BadRequestException(name.reason);
    const existing = await this.locationRepository.find({ where: { userId }, withDeleted: true });
    if (existing.some((l) => l.name.toLowerCase() === name.value.toLowerCase())) {
      throw new ConflictException('location-name-exists');
    }
    return this.locationRepository.save(this.locationRepository.create({ userId, name: name.value }));
  }

  async listLocations(userId: string): Promise<StockLocation[]> {
    return this.locationRepository.find({ where: { userId }, order: { name: 'ASC' } });
  }

  private async requireLocation(userId: string, locationId: string): Promise<StockLocation> {
    const location = await this.locationRepository.findOne({ where: { userId, id: locationId } });
    if (!location) throw new NotFoundException('location-not-found');
    return location;
  }

  async receiveStock(userId: string, dto: ReceiveStockDto) {
    const sku = validateStockSku(dto.sku);
    if (!sku.ok) throw new BadRequestException(sku.reason);
    await this.requireLocation(userId, dto.locationId);
    const row = await this.stockRepository.findOne({ where: { userId, locationId: dto.locationId, sku: sku.value } });
    const plan = planStockReceipt(row ? row.onHand : 0, dto.qty);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    if (!row) {
      const created = await this.stockRepository.save(
        this.stockRepository.create({ userId, locationId: dto.locationId, sku: sku.value, onHand: plan.value }),
      );
      return { locationId: created.locationId, sku: created.sku, onHand: created.onHand };
    }
    row.onHand = plan.value;
    const saved = await this.stockRepository.save(row);
    return { locationId: saved.locationId, sku: saved.sku, onHand: saved.onHand };
  }

  async transferStock(userId: string, dto: TransferStockDto) {
    const sku = validateStockSku(dto.sku);
    if (!sku.ok) throw new BadRequestException(sku.reason);
    const from = await this.locationRepository.findOne({ where: { userId, id: dto.fromLocationId } });
    if (!from) throw new NotFoundException('location-not-found');
    const to = await this.locationRepository.findOne({ where: { userId, id: dto.toLocationId } });
    if (!to) throw new NotFoundException('location-to-not-found');
    if (from.id === to.id) throw new BadRequestException('location-transfer-same');
    const fromRow = await this.stockRepository.findOne({ where: { userId, locationId: from.id, sku: sku.value } });
    const toRow = await this.stockRepository.findOne({ where: { userId, locationId: to.id, sku: sku.value } });
    const plan = planStockTransfer(fromRow ? fromRow.onHand : 0, toRow ? toRow.onHand : 0, dto.qty);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    if (fromRow) {
      fromRow.onHand = plan.value.newFrom;
      await this.stockRepository.save(fromRow);
    } else {
      await this.stockRepository.save(
        this.stockRepository.create({ userId, locationId: from.id, sku: sku.value, onHand: plan.value.newFrom }),
      );
    }
    if (toRow) {
      toRow.onHand = plan.value.newTo;
      await this.stockRepository.save(toRow);
    } else {
      await this.stockRepository.save(
        this.stockRepository.create({ userId, locationId: to.id, sku: sku.value, onHand: plan.value.newTo }),
      );
    }
    return { sku: sku.value, from: plan.value.newFrom, to: plan.value.newTo };
  }

  async locationStock(userId: string, locationId: string): Promise<LocationStock[]> {
    await this.requireLocation(userId, locationId);
    return this.stockRepository.find({ where: { userId, locationId }, order: { sku: 'ASC' } });
  }

  async skuTotals(userId: string, rawSku: string) {
    const sku = validateStockSku(rawSku);
    if (!sku.ok) throw new BadRequestException(sku.reason);
    const rows = await this.stockRepository.find({ where: { userId, sku: sku.value }, order: { locationId: 'ASC' } });
    const total = rows.reduce((acc, r) => acc + r.onHand, 0);
    return { sku: sku.value, locations: rows, total };
  }
}
