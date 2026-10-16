// ============================================================================
// FILE: /apps/api/src/modules/taxes/taxes.service.ts
// ============================================================================
// Computation lives in the engines; this service persists the audit record
// for every computation and turns refusals into structured errors. Tax is
// never guessed and never silently dropped.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxRecord } from './entities/tax-record.entity';
import { FilingDto, VatDto, WithholdingDto } from './dto/tax.dto';
import { computeVat } from './engine/tax-compute';
import { computeWithholding } from './engine/withholding';
import { filingSummary } from './engine/tax-filing';

@Injectable()
export class TaxesService {
  constructor(
    @InjectRepository(TaxRecord)
    private readonly taxRecordRepository: Repository<TaxRecord>,
  ) {}

  async vat(userId: string, dto: VatDto) {
    const verdict = computeVat(dto.amountCents, dto.rateBps, dto.mode);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const record = await this.persist(userId, 'vat', dto as unknown as Record<string, unknown>, verdict.value);
    return { recordId: record.id, ...verdict.value };
  }

  async withholding(userId: string, dto: WithholdingDto) {
    const verdict = computeWithholding(dto.grossCents, dto.kind);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const record = await this.persist(userId, 'withholding', dto as unknown as Record<string, unknown>, verdict.value);
    return { recordId: record.id, ...verdict.value };
  }

  async filing(userId: string, dto: FilingDto) {
    const verdict = filingSummary(dto.outputVatCents, dto.inputVatCents, dto.periodLabel);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const record = await this.persist(
      userId,
      'filing',
      dto as unknown as Record<string, unknown>,
      verdict.value,
      dto.periodLabel,
    );
    return { recordId: record.id, ...verdict.value };
  }

  async records(userId: string): Promise<TaxRecord[]> {
    return this.taxRecordRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  private async persist(
    userId: string,
    kind: string,
    inputs: Record<string, unknown>,
    result: Record<string, unknown>,
    periodLabel?: string,
  ): Promise<TaxRecord> {
    return this.taxRecordRepository.save(
      this.taxRecordRepository.create({
        userId,
        kind,
        inputs,
        result,
        ...(periodLabel !== undefined ? { periodLabel } : {}),
      }),
    );
  }
}
