// ============================================================================
// FILE: /apps/api/src/modules/inventory/entities/stock-movement.entity.ts
// ============================================================================

// Append-only movement log. Positive qty is stock in, negative is stock
// out; the engine refuses anything that would drive on-hand negative.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stock_movements')
@Index(['userId', 'itemId', 'at'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ type: 'timestamptz' })
  at: Date;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
