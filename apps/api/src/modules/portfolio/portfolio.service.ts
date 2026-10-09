// ============================================================================
// FILE: /apps/api/src/modules/portfolio/portfolio.service.ts
// ============================================================================
// The honest data layer for Features 44 and 45. The rules live in the pure
// engines (./engine); this service only gathers the user's OWN products and
// opportunities, maps them into plain engine inputs, and returns what the
// engines conclude. Read-only by design: a portfolio view is a read, and an
// allocation plan is advice, never an automatic spend.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { decide } from '../products/decision/decision.service';
import { DECIDABLE_STATUSES, DECISION_MIN_OBSERVATION_DAYS } from '../products/decision/decision.config';
import { assessPortfolioRisk } from './engine/portfolio-risk';
import { allocateCapital } from './engine/capital-allocation';
import { AllocateCapitalDto } from './dto/allocate-capital.dto';

// Decimal columns come back as strings; missing values are 0 evidence,
// never NaN â same law as the decision engine's own input mapper.
function num(v: any): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ageDaysOf(createdAt: Date | undefined | null): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created) || created <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86400000));
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  // Feature 44 â portfolio risk & correlation analysis. Pure read.
  async getRisk(userId: string) {
    const products = await this.productRepository.find({ where: { userId } });
    const opportunities = await this.opportunityRepository.find({ where: { userId } });

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
    return { ...risk, evaluatedAt: new Date().toISOString() };
  }

  // Feature 45 â capital allocation optimizer. Read-only: the plan is advice.
  // Candidates are the user's own products, each judged fresh by the pure
  // decision engine; the allocator then distributes the budget across the
  // SCALE/PIVOT verdicts with per-candidate caps and a named reserve.
  async allocateCapital(userId: string, dto: AllocateCapitalDto) {
    const products = await this.productRepository.find({ where: { userId } });

    const evaluated = products.map(product => {
      const decision = decide({
        status: String(product.status || ''),
        revenue: num(product.revenue),
        orders: Number(product.orders) || 0,
        averageOrderValue: num(product.averageOrderValue),
        ageDays: ageDaysOf(product.createdAt),
      });
      return {
        product,
        decision,
        // Explainability for pre-decision candidates: show why no verdict.
        pendingBecause: (DECIDABLE_STATUSES as readonly string[]).includes(String(product.status))
          ? 'inside the ' + DECISION_MIN_OBSERVATION_DAYS + '-day observation window'
          : 'status ' + product.status + ' has no live market data yet',
      };
    });

    const plan = allocateCapital(
      dto.budget,
      evaluated.map(e => ({
        id: e.product.id,
        name: e.product.name,
        verdict: e.decision.verdict,
        confidence: e.decision.confidence,
      })),
      { maxSharePerCandidate: dto.maxSharePerCandidate },
    );

    return {
      ...plan,
      candidates: evaluated.map(e => ({
        id: e.product.id,
        name: e.product.name,
        status: e.product.status,
        verdict: e.decision.verdict,
        confidence: e.decision.confidence,
        reasons: e.decision.reasons,
        pendingBecause: e.decision.verdict === 'HOLD' ? e.pendingBecause : null,
      })),
      decidedAt: new Date().toISOString(),
    };
  }
}
