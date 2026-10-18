// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/training-dataset.entity.ts
// ============================================================================
// One row per immutable dataset snapshot (FORGE AI-005/006). Snapshots are
// frozen evidence: the item ids, the content fingerprint, and the lineage
// chain (parent id + version) are stored so any training run can name the
// exact dataset version it consumed. Snapshots are never mutated after
// creation — a changed dataset is a NEW row with version+1 (immutability
// law, enforced by the pure engine).

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('training_datasets')
@Index(['userId', 'name'])
@Index(['userId', 'version'])
export class TrainingDataset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** Monotone per (userId, name): parent version + 1, engine-enforced. */
  @Column({ type: 'int' })
  version: number;

  /** Content fingerprint from the pure engine — content truth, not a guess. */
  @Column({ type: 'varchar', length: 32 })
  fingerprint: string;

  /** Frozen list of member asset ids (order preserved, engine-canonical). */
  @Column({ type: 'jsonb' })
  itemIds: string[];

  @Column({ type: 'int' })
  itemCount: number;

  /** Lineage: the snapshot this one was built from, if any. */
  @Column({ type: 'uuid', nullable: true })
  parentSnapshotId: string | null;

  @Column({ type: 'int', nullable: true })
  parentVersion: number | null;

  /** Engine-computed summary: kinds, classifications, quality distribution. */
  @Column({ type: 'jsonb', nullable: true })
  summary: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
