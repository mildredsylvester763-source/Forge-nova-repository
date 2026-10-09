// ============================================================================
// FILE: /apps/api/src/modules/pricing/pricing.service.ts
// ============================================================================
// The data layer for Feature 5 (absorbs BZ 26 price suggestion + BZ 145
// pricing alerts). Read-only: it gathers the product's price, units, and
// price-change observations (request body first, stored
// metadata.pricingObservations as fallback), feeds the pure engine, and
// returns the elasticity verdict, suggestion, and alerts.
// Zero-trust: every query is scoped by userId.

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { AnalyzePricingDto } from './dto/analyze-pricing.dto';
import { estimateElasticity, PriceObservation } from './engine/price-elasticity';
import { ElasticityResult } from './engine/price-elasticity';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async analyzeProduct(userId: string, productId: string, dto: AnalyzePricingDto): Promise<ElasticityResult> {
    const product = await this.productRepository.findOne({ where: { id: productId, userId } });
    if (!product) {
      throw new NotFoundException('Product with id ' + productId + ' not found');
    }

    // Observations: request body wins; otherwise the stored experiment log.
    let observations: PriceObservation[] = Array.isArray(dto?.observations) ? dto.observations : [];
    if (!observations.length) {
      const stored = product.metadata?.['pricingObservations'];
      if (Array.isArray(stored)) {
        observations = stored.filter((o: any) => o && typeof o === 'object').map((o: any) => ({
          beforePrice: num(o.beforePrice),
          afterPrice: num(o.afterPrice),
          unitsBefore: num(o.unitsBefore),
          unitsAfter: num(o.unitsAfter),
        }));
      }
    }

    const currentPrice = num(dto?.currentPrice) || num(product.salePrice) || num(product.price);
    // Units per period: explicit request wins; orders over the product's
    // lifetime is the honest fallback (a conservative average, not a peak).
    const unitsPerPeriod = num(dto?.unitsPerPeriod) || Math.max(1, product.orders || 0);
    const storedCost = num(product.pricing?.costPerUnit ?? product.pricing?.cost);
    const costPerUnit = dto?.costPerUnit != null ? num(dto.costPerUnit) : storedCost > 0 ? storedCost : null;

    return estimateElasticity(observations, {
      price: currentPrice,
      unitsPerPeriod,
      costPerUnit,
    });
  }
}
