// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/entities/damaged-goods-log.entity.ts
// ============================================================================

// The immutable damage ledger. Each row records the quantity written off,
// why, and the stock that remained right after. Rows are never edited or
// deleted: history stays true.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('damaged_goods_logs')
@Index(['userId', 'itemId'])
export class DamagedGoodsLog {
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

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'integer' })
  onHandAfter: number;

  @CreateDateColumn()
  createdAt: Date;
}
