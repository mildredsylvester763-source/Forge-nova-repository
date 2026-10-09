// ============================================================================
// FILE: /apps/api/src/modules/competition/competition.service.ts
// ============================================================================
// The data layer for Feature 4. Reads the user's opportunity (its stored
// competitor snapshots) and the product it spawned, maps them into the pure
// engine's inputs with tolerant parsing (junk in the snapshots is skipped
// and counted, never trusted), and returns the gap report + scan report.
// Zero-trust: every query is scoped by userId.

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Product } from '../products/entities/product.entity';
import {
  analyzeCompetitorGap, buildScanReport,
  CompetitorInput, GapReport, MyProfile, ScanReport,
} from './engine/competitor-gap';

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Tolerant mapper: a stored competitor snapshot is untrusted jsonb. Every
// field is parsed defensively; an unreadable row still counts as a
// competitor (crowd size) but contributes nothing it would corrupt.
function toCompetitorInput(raw: Record<string, any>): CompetitorInput {
  return {
    name: String(raw?.name || raw?.title || 'unnamed competitor').slice(0, 255),
    price: num(raw?.price),
    rating: num(raw?.rating),
    reviewCount: num(raw?.reviewCount) != null ? Math.floor(num(raw?.reviewCount)!) : null,
    features: Array.isArray(raw?.features)
      ? raw.features.map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean).slice(0, 50)
      : [],
    shippingDays: num(raw?.shippingDays),
  };
}

@Injectable()
export class CompetitionService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async analyzeOpportunity(userId: string, opportunityId: string): Promise<{ report: GapReport; scanReport: ScanReport }> {
    const opportunity = await this.opportunityRepository.findOne({ where: { id: opportunityId, userId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity with id ' + opportunityId + ' not found');
    }

    const competitors = (Array.isArray(opportunity.competitors) ? opportunity.competitors : [])
      .filter((c: any) => c && typeof c === 'object')
      .map((c: any) => toCompetitorInput(c));

    // If a product already spun off this opportunity, its profile is "me";
    // otherwise the opportunity brief itself is the profile being planned.
    let me: MyProfile = { features: [] };
    if (opportunity.id) {
      const product = await this.productRepository.findOne({ where: { userId, opportunityId } });
      if (product) {
        me = {
          name: product.name,
          price: num(product.price) ?? num(product.salePrice),
          features: Array.isArray(product.tags) ? product.tags : [],
          shippingDays: null,
        };
      }
    }

    const report = analyzeCompetitorGap(me, competitors);
    const scanReport = buildScanReport(me, competitors);
    return { report, scanReport };
  }
}
