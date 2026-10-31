// ============================================================================
// One line of a purchase order: an ordered quantity of one SKU at a unit
// cost, plus how much of it has been received so far.
// ============================================================================

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('purchase_order_lines')
@Index(['userId', 'orderId', 'sku'], { unique: true })
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  orderId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ type: 'integer' })
  unitCostCents: number;

  @Column({ type: 'integer', default: 0 })
  receivedQty: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
