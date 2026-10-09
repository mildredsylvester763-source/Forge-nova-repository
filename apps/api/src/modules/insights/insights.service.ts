// ============================================================================
// FILE: /apps/api/src/modules/insights/insights.service.ts
// ============================================================================
// The data layer for the weekly business report (BizStack 20). Gathers the
// user's products (with their latest verdicts, tolerant-parsed from
// metadata), opportunities, and the portfolio risk computed by the same
// engine the risk endpoint uses — then hands a pure snapshot to the pure
// report engine. The clock is read HERE (service layer), never in the
// engine. Zero-trust: every query is scoped by userId.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { assessPortfolioRisk } from '../portfolio/engine/portfolio-risk';
import { buildWeeklyReport, ReportSnapshot, WeeklyReport } from './engine/weekly-report';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class InsightsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async getWeeklyReport(userId: string): Promise<WeeklyReport> {
    const [products, opportunities] = await Promise.all([
      this.productRepository.find({ where: { userId } }),
      this.opportunityRepository.find({ where: { userId }, take: 500 }),
    ]);

    const risk = assessPortfolioRisk(
      products.map(p => ({
        id: p.id,
        category: String(p.type || ''),
        status: String(p.status || ''),
        revenue: num(p.revenue),
      })),
      opportunities.map(o => ({
        id: o.id,
        category: String(o.category || ''),
        score: num(o.score),
      })),
    );

    const snapshot: ReportSnapshot = {
      date: new Date().toISOString().slice(0, 10),
      products: products.map(p => ({
        id: p.id,
        name: String(p.name || 'unnamed'),
        status: String(p.status || ''),
        revenue: num(p.revenue),
        orders: num(p.orders),
        // Latest verdict, tolerant-parsed — stale or malformed metadata
        // degrades to null, never to a guessed verdict.
        verdict: (p.metadata?.['decision'] && typeof p.metadata['decision'] === 'object'
          ? String((p.metadata['decision'] as Record<string, any>).verdict || '')
          : '') || null,
      })),
      opportunities: opportunities.map(o => ({
        id: o.id,
        title: String(o.title || 'untitled'),
        category: String(o.category || ''),
        score: num(o.score),
        status: String(o.status || ''),
      })),
      risk: { riskScore: risk.riskScore, verdict: risk.verdict, warnings: risk.warnings },
    };

    return buildWeeklyReport(snapshot);
  }
}
