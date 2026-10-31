// ============================================================================
// A purchase order. Numbers are sequential per owner; status walks the
// lifecycle draft -> sent -> (partially-received) -> received, or cancelled
// while nothing has been received yet.
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

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partially-received'
  | 'received'
  | 'cancelled';

@Entity('purchase_orders')
@Index(['userId', 'poNumber'], { unique: true })
@Index(['userId', 'status'])
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  supplierId: string;

  @Column({ type: 'integer' })
  poNumber: number;

  @Column({ type: 'text', default: 'draft' })
  status: PurchaseOrderStatus;

  @Column({ type: 'timestamptz', nullable: true })
  expectedAt?: Date | null;

  @Column({ type: 'integer', default: 0 })
  totalCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
