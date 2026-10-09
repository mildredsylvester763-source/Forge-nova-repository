// ============================================================================
// FILE: /apps/api/src/modules/finance/finance.service.ts
// ============================================================================
// The data layer for the cash-flow forecast (BizStack 22). Reconstructs the
// user's TOTAL cumulative revenue over time from the immutable product
// history snapshots: each row's snapshot.revenue is that product's
// cumulative figure at that moment, so walking the rows in time order and
// diffing per product rebuilds the portfolio total without a single new
// table. Zero-trust: every query is scoped by userId.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductHistory } from '../products/entities/product-history.entity';
import { Product } from '../products/entities/product.entity';
import { forecastCashFlow, RevenuePoint } from './engine/cash-flow-forecast';
import { CashFlowForecast } from './engine/cash-flow-forecast';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(ProductHistory)
    private readonly historyRepository: Repository<ProductHistory>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async getCashFlowForecast(userId: string, periods?: number): Promise<CashFlowForecast> {
    // History rows, oldest first — the reconstruction depends on order.
    const rows = await this.historyRepository.find({
      where: { userId },
      order: { changedAt: 'ASC' },
      take: 2000,
    });

    // Only rows that actually carry a numeric revenue snapshot participate.
    const usable = rows.filter(r => r.snapshot && Number.isFinite(Number(r.snapshot['revenue'])));

    let series: RevenuePoint[];
    if (usable.length >= 2) {
      // Walk the rows, diffing each product's cumulative revenue, and keep a
      // running portfolio total. Corrections (a dip) clamp at the engine.
      const lastByProduct = new Map<string, number>();
      let total = 0;
      series = [];
      for (const row of usable) {
        const rev = Math.max(0, num(row.snapshot?.['revenue']));
        const prev = lastByProduct.get(row.productId) ?? 0;
        total += rev - prev;
        lastByProduct.set(row.productId, rev);
        series.push({ date: new Date(row.changedAt).toISOString(), cumulativeRevenue: Math.max(0, total) });
      }
    } else {
      // Not enough snapshot history: fall back to each product's CURRENT
      // cumulative revenue as a single point. One point is honest — the
      // engine will refuse to forecast on it, with the reason why.
      const products = await this.productRepository.find({ where: { userId } });
      const total = products.reduce((a, p) => a + Math.max(0, num(p.revenue)), 0);
      series = [{ date: new Date().toISOString(), cumulativeRevenue: total }];
    }

    return forecastCashFlow(series, periods ?? 4);
  }
}
