// ============================================================================
// FILE: /apps/api/src/modules/taxes/entities/tax-record.entity.ts
// ============================================================================

// Every tax computation is persisted: what was computed, from what inputs,
// and what the engine said. Tax history is an audit obligation, not an
// optional extra.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tax_records')
@Index(['userId', 'kind', 'createdAt']])
export class TaxRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** 'vat' | 'withholding' | 'filing' */
  @Column({ type: 'text' })
  kind: string;

  @Column({ type: 'jsonb', default: {} })
  inputs: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  result: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  periodLabel?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
