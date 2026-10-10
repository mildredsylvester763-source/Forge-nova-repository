// ============================================================================
// FILE: /apps/api/src/modules/recurring/entities/recurring-invoice-profile.entity.ts
// ============================================================================
// A recurring profile is a template plus a schedule. It never stores generated
// invoices itself — every run asks the invoices service to create a real
// invoice from the template, so all money math stays in one place.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly';

export interface RecurringTemplate {
  customerName?: string;
  customerEmail?: string;
  productId?: string;
  currency?: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  taxRatePercent?: number;
  netDays?: number;
  notes?: string;
}

@Entity('recurring_invoice_profiles')
@Index(['userId', 'active'])
@Index(['userId', 'nextRunAt'])
export class RecurringInvoiceProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ['weekly', 'monthly', 'quarterly'] as const, default: 'monthly' as const })
  frequency: RecurringFrequency;

  /** Weekly: 0 (Sunday) through 6 (Saturday). Monthly/quarterly: 1 through 31, clamped to the month. */
  @Column({ type: 'integer' })
  anchorDay: number;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'jsonb' })
  template: RecurringTemplate;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
