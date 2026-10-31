import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { normalizeSupplier } from './engine/supplier-engine';
import { CreateSupplierDto } from './dto/purchasing.dto';

// Supplier records: who you buy from, how to reach them, how long they take.
// Honest grounding: we store the record; we never pretend to contact anyone.
// Names are unique per owner, case-insensitively.

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
  ) {}

  async create(userId: string, dto: CreateSupplierDto): Promise<Supplier> {
    const verdict = normalizeSupplier({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      leadTimeDays: dto.leadTimeDays === undefined ? null : dto.leadTimeDays,
      notes: dto.notes,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const existing = await this.suppliers.find({ where: { userId } });
    const lower = verdict.value.name.toLowerCase();
    for (const row of existing) {
      if (row.name.toLowerCase() === lower) {
        throw new ConflictException('supplier-name-exists');
      }
    }
    const row = this.suppliers.create({
      userId,
      name: verdict.value.name,
      email: verdict.value.email,
      phone: verdict.value.phone,
      address: verdict.value.address,
      leadTimeDays: verdict.value.leadTimeDays,
      notes: verdict.value.notes,
      createdAt: new Date(),
    });
    return this.suppliers.save(row);
  }

  async list(userId: string): Promise<Supplier[]> {
    return this.suppliers.find({ where: { userId }, order: { name: 'ASC' } });
  }

  async archive(userId: string, supplierId: string): Promise<void> {
    const row = await this.suppliers.findOne({ where: { userId, id: supplierId } });
    if (!row) throw new NotFoundException('supplier-not-found');
    await this.suppliers.softDelete({ userId, id: supplierId });
  }
}
