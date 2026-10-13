// ============================================================================
// FILE: /apps/api/src/modules/accounting/entities/accounting-period.entity.ts
// ============================================================================
// A named, dated slice of the books. Closing a period stamps closedAt and the
// journal summary at that moment; the journals themselves are immutable, so a
// closed period is a freeze-frame, not a lock on rows.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('accounting_periods')
@Index(['userId', 'name'])
export class AccountingPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ type: 'integer', default: 0 })
  journalCount: number;

  @Column({ type: 'integer', default: 0 })
  journalTotalCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
