// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/entities/cost-receipt.entity.ts
// ============================================================================

// The immutable purchase-cost ledger. Every recorded receipt keeps its own
// quantity, unit cost and the average cost right after it was applied.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('cost_receipts')
@Index(['userId', 'itemId'])
export class CostReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  itemId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ type: 'integer' })
  unitCostCents: number;

  @Column({ type: 'integer' })
  avgCostAfterCents: number;

  @CreateDateColumn()
  createdAt: Date;
}
