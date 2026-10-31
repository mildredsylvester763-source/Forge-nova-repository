// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/entities/low-stock-alert.entity.ts
// ============================================================================

// One alert row per low-stock event. status: open when the scan found it,
// acknowledged when the owner marked it seen, resolved when stock recovered
// (or the same row is simply never re-alerted while active).

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('low_stock_alerts')
@Index(['userId', 'itemId'])
export class LowStockAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  itemId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'integer' })
  onHandAtAlert: number;

  @Column({ type: 'integer' })
  thresholdAtAlert: number;

  @Column({ type: 'text', default: 'open' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
