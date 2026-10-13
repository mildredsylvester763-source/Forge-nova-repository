// ============================================================================
// FILE: /apps/api/src/modules/accounting/entities/journal-entry.entity.ts
// ============================================================================
// A journal is one atomic financial event: balanced debit and credit lines.
// Lines are stored as an immutable snapshot inside the journal row — journals
// are never updated after posting, only read. Idempotency keys make retries
// safe: the same key can never post twice.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type JournalSide = 'debit' | 'credit';

export interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  side: JournalSide;
  amountCents: number;
}

export type JournalSourceType = 'manual' | 'invoice_issued' | 'invoice_payment' | 'credit_note_issued' | 'expense';

@Entity('journal_entries')
@Index(['userId', 'idempotencyKey'])
@Index(['userId', 'sourceType', 'sourceId'])
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: ['manual', 'invoice_issued', 'invoice_payment', 'credit_note_issued', 'expense'] as const, default: 'manual' as const })
  sourceType: JournalSourceType;

  @Column({ type: 'uuid', nullable: true })
  sourceId?: string;

  /** Retry-safe: the same key can never post twice. */
  @Column()
  idempotencyKey: string;

  @Column({ type: 'jsonb' })
  lines: JournalLine[];

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'integer', default: 0 })
  totalCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
