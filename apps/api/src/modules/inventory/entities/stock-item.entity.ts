// ============================================================================
// FILE: /apps/api/src/modules/inventory/entities/stock-item.entity.ts
// ============================================================================

// A stock item carries its own reorder parameters; onHand is always the
// ledger total of its movements, never a hand-edited number.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stock_items')
@Index(['userId', 'sku'], { unique: true })
export class StockItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'integer', default: 0 })
  onHand: number;

  @Column({ type: 'integer', default: 0 })
  dailyDemand: number;

  @Column({ type: 'integer', default: 0 })
  leadTimeDays: number;

  @Column({ type: 'integer', default: 0 })
  safetyStock: number;

  @Column({ type: 'integer', default: 0 })
  unitCostCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
