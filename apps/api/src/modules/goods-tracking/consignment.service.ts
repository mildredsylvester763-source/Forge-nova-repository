// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/consignment.service.ts
// ============================================================================
// Consignment tracking: consignors hand over stock they still own, sales
// split the money exactly (commission for the shop, payout owed to the
// consignor), and unsold stock can be handed back. Every refusal leaves the
// lots and the ledger untouched.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consignor } from './entities/consignor.entity';
import { ConsignmentLot } from './entities/consignment-lot.entity';
import { ConsignmentEvent } from './entities/consignment-event.entity';
import {
  ConsignmentReturnDto,
  ConsignmentSaleDto,
  CreateConsignorDto,
  ReceiveConsignmentDto,
} from './dto/goods-tracking.dto';
import {
  consignmentEconomics,
  planConsignmentTake,
  validateCommissionPct,
  validateConsignorName,
  validateConsignmentPrice,
  validateConsignmentQty,
  validateConsignmentSku,
} from './engine/consignment-engine';

@Injectable()
export class ConsignmentService {
  constructor(
    @InjectRepository(Consignor)
    private readonly consignorRepository: Repository<Consignor>,
    @InjectRepository(ConsignmentLot)
    private readonly lotRepository: Repository<ConsignmentLot>,
    @InjectRepository(ConsignmentEvent)
    private readonly eventRepository: Repository<ConsignmentEvent>,
  ) {}

  async createConsignor(userId: string, dto: CreateConsignorDto) {
    const nameVerdict = validateConsignorName(dto.name);
    if (!nameVerdict.ok) {
      throw new BadRequestException(nameVerdict.reason);
    }
    const pctVerdict = validateCommissionPct(dto.defaultCommissionPct);
    if (!pctVerdict.ok) {
      throw new BadRequestException(pctVerdict.reason);
    }
    const owned = await this.consignorRepository.find({ where: { userId } });
    const duplicate = owned.find(
      (candidate) => candidate.name.toLowerCase() === nameVerdict.value.toLowerCase(),
    );
    if (duplicate) {
      throw new ConflictException('consignor-name-exists');
    }
    return this.consignorRepository.save(
      this.consignorRepository.create({
        userId,
        name: nameVerdict.value,
        defaultCommissionPct: pctVerdict.value,
      }),
    );
  }

  async listConsignors(userId: string) {
    return this.consignorRepository.find({ where: { userId }, order: { name: 'ASC' } });
  }

  async receiveConsignment(userId: string, dto: ReceiveConsignmentDto) {
    const skuVerdict = validateConsignmentSku(dto.sku);
    if (!skuVerdict.ok) {
      throw new BadRequestException(skuVerdict.reason);
    }
    const qtyVerdict = validateConsignmentQty(dto.qty);
    if (!qtyVerdict.ok) {
      throw new BadRequestException(qtyVerdict.reason);
    }
    const consignor = await this.consignorRepository.findOne({ where: { userId, id: dto.consignorId } });
    if (!consignor) {
      throw new NotFoundException('consignor-not-found');
    }
    let lot = await this.lotRepository.findOne({
      where: { userId, consignorId: consignor.id, sku: skuVerdict.value },
    });
    if (!lot) {
      lot = this.lotRepository.create({
        userId,
        consignorId: consignor.id,
        sku: skuVerdict.value,
        qtyOnConsignment: 0,
      });
    }
    lot.qtyOnConsignment = lot.qtyOnConsignment + qtyVerdict.value;
    await this.lotRepository.save(lot);
    return {
      consignorId: consignor.id,
      sku: lot.sku,
      qtyOnConsignment: lot.qtyOnConsignment,
    };
  }

  async recordSale(userId: string, dto: ConsignmentSaleDto) {
    const skuVerdict = validateConsignmentSku(dto.sku);
    if (!skuVerdict.ok) {
      throw new BadRequestException(skuVerdict.reason);
    }
    const qtyVerdict = validateConsignmentQty(dto.qty);
    if (!qtyVerdict.ok) {
      throw new BadRequestException(qtyVerdict.reason);
    }
    const priceVerdict = validateConsignmentPrice(dto.unitPriceCents);
    if (!priceVerdict.ok) {
      throw new BadRequestException(priceVerdict.reason);
    }
    const consignor = await this.consignorRepository.findOne({ where: { userId, id: dto.consignorId } });
    if (!consignor) {
      throw new NotFoundException('consignor-not-found');
    }
    const lot = await this.lotRepository.findOne({
      where: { userId, consignorId: consignor.id, sku: skuVerdict.value },
    });
    if (!lot) {
      throw new NotFoundException('consignment-lot-not-found');
    }
    const plan = planConsignmentTake(lot.qtyOnConsignment, qtyVerdict.value);
    if (!plan.ok) {
      throw new BadRequestException(plan.reason);
    }
    const econ = consignmentEconomics(qtyVerdict.value, priceVerdict.value, consignor.defaultCommissionPct);
    if (!econ.ok) {
      throw new BadRequestException(econ.reason);
    }
    const event = await this.eventRepository.save(
      this.eventRepository.create({
        userId,
        consignorId: consignor.id,
        sku: lot.sku,
        kind: 'sale',
        qty: qtyVerdict.value,
        unitPriceCents: priceVerdict.value,
        commissionPct: consignor.defaultCommissionPct,
        totalCents: econ.value.totalCents,
        commissionCents: econ.value.commissionCents,
        payoutCents: econ.value.payoutCents,
      }),
    );
    lot.qtyOnConsignment = plan.value;
    await this.lotRepository.save(lot);
    return {
      eventId: event.id,
      sku: lot.sku,
      qty: qtyVerdict.value,
      totalCents: econ.value.totalCents,
      commissionCents: econ.value.commissionCents,
      payoutCents: econ.value.payoutCents,
      qtyOnConsignment: plan.value,
    };
  }

  async returnConsignment(userId: string, dto: ConsignmentReturnDto) {
    const skuVerdict = validateConsignmentSku(dto.sku);
    if (!skuVerdict.ok) {
      throw new BadRequestException(skuVerdict.reason);
    }
    const qtyVerdict = validateConsignmentQty(dto.qty);
    if (!qtyVerdict.ok) {
      throw new BadRequestException(qtyVerdict.reason);
    }
    const consignor = await this.consignorRepository.findOne({ where: { userId, id: dto.consignorId } });
    if (!consignor) {
      throw new NotFoundException('consignor-not-found');
    }
    const lot = await this.lotRepository.findOne({
      where: { userId, consignorId: consignor.id, sku: skuVerdict.value },
    });
    if (!lot) {
      throw new NotFoundException('consignment-lot-not-found');
    }
    const plan = planConsignmentTake(lot.qtyOnConsignment, qtyVerdict.value);
    if (!plan.ok) {
      throw new BadRequestException(plan.reason);
    }
    const event = await this.eventRepository.save(
      this.eventRepository.create({
        userId,
        consignorId: consignor.id,
        sku: lot.sku,
        kind: 'return',
        qty: qtyVerdict.value,
        unitPriceCents: null,
        commissionPct: 0,
        totalCents: null,
        commissionCents: null,
        payoutCents: null,
      }),
    );
    lot.qtyOnConsignment = plan.value;
    await this.lotRepository.save(lot);
    return {
      eventId: event.id,
      sku: lot.sku,
      qty: qtyVerdict.value,
      qtyOnConsignment: plan.value,
    };
  }

  async summary(userId: string, consignorId: string) {
    const consignor = await this.consignorRepository.findOne({ where: { userId, id: consignorId } });
    if (!consignor) {
      throw new NotFoundException('consignor-not-found');
    }
    const lots = await this.lotRepository.find({
      where: { userId, consignorId },
      order: { sku: 'ASC' },
    });
    const events = await this.eventRepository.find({
      where: { userId, consignorId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const sales = events.filter((e) => e.kind === 'sale');
    const returns = events.filter((e) => e.kind === 'return');
    const soldQty = sales.reduce((acc, e) => acc + e.qty, 0);
    const returnedQty = returns.reduce((acc, e) => acc + e.qty, 0);
    const totalSalesCents = sales.reduce((acc, e) => acc + (e.totalCents ?? 0), 0);
    const commissionCents = sales.reduce((acc, e) => acc + (e.commissionCents ?? 0), 0);
    const payoutOwedCents = sales.reduce((acc, e) => acc + (e.payoutCents ?? 0), 0);
    return {
      consignor: {
        id: consignor.id,
        name: consignor.name,
        defaultCommissionPct: consignor.defaultCommissionPct,
      },
      lots,
      totals: {
        qtyOnConsignment: lots.reduce((acc, l) => acc + l.qtyOnConsignment, 0),
        soldQty,
        returnedQty,
        totalSalesCents,
        commissionCents,
        payoutOwedCents,
      },
    };
  }
}
