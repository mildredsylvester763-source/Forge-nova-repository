// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/entities/credit-note.entity.ts
// ============================================================================
// Credit notes store money in integer cents, exactly like invoices. Applying
// a note never edits an invoice directly — every application is appended to
// the ledger here, and an invoice is only marked paid when the note covers
// its full total.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CreditNoteStatus = 'open' | 'applied' | 'void';

export interface CreditApplication {
  invoiceId: string;
  invoiceNumber: string;
  appliedCents: number;
  appliedAt: string;
}

@Entity('credit_notes')
@Index(['userId', 'status'])
export class CreditNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ default: 'USD' })
  currency: string;

  /** The full face value of the note in cents. */
  @Column({ type: 'integer' })
  amountCents: number;

  /** How much of the face value has been applied so far. */
  @Column({ type: 'integer', default: 0 })
  appliedCents: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'enum', enum: ['open', 'applied', 'void'] as const, default: 'open' as const })
  status: CreditNoteStatus;

  /** Append-only ledger of applications. Never rewritten. */
  @Column({ type: 'jsonb', default: [] })
  applications: CreditApplication[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
