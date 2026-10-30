// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/eval-suite-version.entity.ts
// ============================================================================
// One row per benchmark suite VERSION (FORGE AI-021/022/023). A suite is a
// named, versioned, content-fingerprinted set of eval cases. The fingerprint
// covers CONTENT only (engine law) — identical content at a new version is
// refused by the service by name. Versions are gap-free: the next version
// must be exactly latest+1. Zero-trust: every row is scoped to its owner.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('eval_suite_versions')
@Index(['userId', 'suiteId', 'version'], { unique: true })
export class EvalSuiteVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** The logical suite name, stable across versions. */
  @Column({ type: 'varchar', length: 64 })
  suiteId: string;

  @Column({ type: 'int' })
  version: number;

  /** Engine law: forge|creative. */
  @Column({ type: 'varchar', length: 16 })
  kind: string;

  /** Engine-validated eval cases (id, optional domain, criteria, weight). */
  @Column({ type: 'jsonb' })
  cases: { id: string; domain?: string; criteria: string[]; weight?: number }[];

  /** Content fingerprint (djb2, engine-computed) — content identity, not version. */
  @Column({ type: 'varchar', length: 32 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
