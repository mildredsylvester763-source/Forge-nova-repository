// ============================================================================
// FILE: /apps/api/src/modules/invoices/entities/invoice.entity.ts
// ============================================================================
// Money lives in integer cents here — never floating point. The tax rate is
// basis points (1000 = 10.00%), so there is no rounding ambiguity anywhere
// between the engine and the database.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvoiceStatus } from '../enums';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotalCents: number;
}

@Entity('invoices')
@Index(['userId', 'number'])
@Index(['userId', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  accountId: string;

  /** Human-facing, per-user sequence: INV-0001, INV-0002, ... */
  @Column()
  number: string;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ type: 'text', nullable: true })
  customerName?: string;

  @Column({ type: 'text', nullable: true })
  customerEmail?: string;

  @Column({ type: 'uuid', nullable: true })
  productId?: string;

  @Column({ type: 'jsonb', default: [] })
  lineItems: InvoiceLineItem[];

  @Column({ type: 'integer', default: 0 })
  subtotalCents: number;

  /** Basis points: 1000 = 10.00%. Zero means no tax line. */
  @Column({ type: 'integer', default: 0 })
  taxRateBp: number;

  @Column({ type: 'integer', default: 0 })
  taxCents: number;

  @Column({ type: 'integer', default: 0 })
  totalCents: number;

  @Column({ type: 'timestamptz', nullable: true })
  issueDate?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
