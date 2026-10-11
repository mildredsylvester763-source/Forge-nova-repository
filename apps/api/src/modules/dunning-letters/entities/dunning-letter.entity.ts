// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/entities/dunning-letter.entity.ts
// ============================================================================
// A dunning letter is an immutable record of what was composed and when it
// was sent. One letter per invoice per reminder stage — the unique index
// enforces idempotency at the database level.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from '../../invoices/entities/invoice.entity';

export type DunningLetterTone = 'gentle' | 'polite' | 'firm' | 'urgent' | 'final';

@Entity('dunning_letters')
@Index(['userId', 'invoiceId', 'stageOffsetDays'], { unique: true })
export class DunningLetter {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() userId: string;

  @Column({ type: 'uuid' }) invoiceId: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  /** Reminder ladder offset this letter belongs to (-3, 0, 7, 14, 30, 60). */
  @Column({ type: 'integer' }) stageOffsetDays: number;

  @Column({ type: 'varchar', length: 16 }) tone: DunningLetterTone;

  @Column({ type: 'text' }) subject: string;

  @Column({ type: 'text' }) body: string;

  @Column({ type: 'integer', default: 0 }) daysOverdue: number;

  @Column({ type: 'integer', default: 0 }) lateFeeCents: number;

  @Column({ type: 'timestamptz', nullable: true }) sentAt?: Date | null;

  @CreateDateColumn() createdAt: Date;
}
