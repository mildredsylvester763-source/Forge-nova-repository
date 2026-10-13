// ============================================================================
// FILE: /apps/api/src/modules/expenses/entities/expense.entity.ts
// ============================================================================
// Money out. An expense posts to the ledger once via its idempotency key
// ('expense-<id>'): DR Operating Expenses / CR Cash. journalId records the
// posting so the audit trail is bidirectional.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('expenses')
@Index(['userId', 'incurredAt'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  vendorName?: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'text', default: 'uncategorized' })
  category: string;

  @Column({ type: 'timestamptz' })
  incurredAt: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'uuid', nullable: true })
  journalId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
