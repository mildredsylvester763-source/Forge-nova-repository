// ============================================================================
// FILE: /apps/api/src/modules/quotes/entities/quote.entity.ts
// ============================================================================
// Quotes share the invoice money model: integer cents, basis-point tax,
// cent-exact totals computed by the same pure engine. A quote is never an
// invoice — conversion is an explicit, one-time, auditable step.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  CONVERTED = 'converted',
}

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotalCents: number;
}

@Entity('quotes')
@Index(['userId', 'number'])
@Index(['userId', 'status'])
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Human-facing, per-user sequence: QT-0001, QT-0002, ... */
  @Column()
  number: string;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ type: 'text', nullable: true })
  customerName?: string;

  @Column({ type: 'text', nullable: true })
  customerEmail?: string;

  @Column({ type: 'jsonb', default: [] })
  lineItems: QuoteLineItem[];

  @Column({ type: 'integer', default: 0 })
  subtotalCents: number;

  @Column({ type: 'integer', default: 0 })
  taxRateBp: number;

  @Column({ type: 'integer', default: 0 })
  taxCents: number;

  @Column({ type: 'integer', default: 0 })
  totalCents: number;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ type: 'uuid', nullable: true })
  convertedInvoiceId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
