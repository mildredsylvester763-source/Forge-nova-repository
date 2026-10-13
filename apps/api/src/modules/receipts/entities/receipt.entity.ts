// ============================================================================
// FILE: /apps/api/src/modules/receipts/entities/receipt.entity.ts
// ============================================================================
// A receipt is an immutable proof-of-payment document. One receipt per
// payment, ever (unique paymentId) — issuing twice returns the existing
// receipt instead of silently minting a second one.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentAllocation } from '../../payments/entities/payment.entity';

@Entity('receipts')
@Index(['userId', 'receiptNumber'])
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Idempotency at the DB level: one receipt per payment, ever. */
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  paymentId: string;

  @Column()
  receiptNumber: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  customerName?: string;

  @Column({ type: 'jsonb', default: [] })
  allocations: PaymentAllocation[];

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
