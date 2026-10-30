// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/panel-vote.entity.ts
// ============================================================================
// One row per human panelist vote on one case of one suite (FORGE AI-023).
// A panelist may vote ONCE per case — duplicates are refused by name at the
// service and blocked at the DB. Aggregation is the engine quorum-gated
// median; order of arrival never matters. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('panel_votes')
@Index(['userId', 'suiteId', 'caseId', 'panelist'], { unique: true })
export class PanelVoteRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  suiteId: string;

  @Column({ type: 'varchar', length: 64 })
  caseId: string;

  @Column({ type: 'varchar', length: 128 })
  panelist: string;

  /** 0..100, engine-validated at aggregation time. */
  @Column({ type: 'numeric', precision: 6, scale: 2 })
  score: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
