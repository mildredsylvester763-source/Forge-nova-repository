// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/entities/item-cost.entity.ts
// ============================================================================

// The running cost picture per stock item: weighted-average unit cost built
// from recorded purchase receipts, plus the owner's sell price. Honest by
// design: avgCostCents stays null until the first receipt is recorded.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('item_costs')
@Index(['userId', 'itemId'], { unique: true })
export class ItemCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  itemId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'integer', default: 0 })
  qtyCosted: number;

  @Column({ type: 'integer', nullable: true })
  avgCostCents: number | null;

  @Column({ type: 'integer', nullable: true })
  sellPriceCents: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
