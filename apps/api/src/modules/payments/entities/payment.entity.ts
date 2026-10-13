// ============================================================================
// FILE: /apps/api/src/modules/payments/entities/payment.entity.ts
// ============================================================================
// A payment is money in, allocated across invoices at the moment it is
// recorded. The allocation snapshot is immutable — it is the audit trail of
// exactly which invoices this money settled, and in what order.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  fullyPaid: boolean;
}

@Entity('payments')
@Index(['userId', 'receivedAt'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'text', default: 'manual' })
  method: string;

  @Column({ type: 'text', nullable: true })
  reference?: string;

  @Column({ type: 'text', nullable: true })
  customerName?: string;

  @Column({ type: 'jsonb', default: [] })
  allocations: PaymentAllocation[];

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
