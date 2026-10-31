// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/shadow-deployment.entity.ts
// ============================================================================
// One shadow deployment (FORGE AI-043): a challenger answering beside the
// champion, its responses NEVER served to users. Pairs are appended as the
// shadow runs; the engine verdict (promote-shadow / hold-shadow) is frozen
// only above the sample floor — under-floor verdicts are refused and this
// row holds no verdict at all. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ShadowPair, ShadowResult } from '../engine/model-operations-engine';

@Entity('shadow_deployments')
@Index(['userId', 'championId'])
export class ShadowDeployment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  championId: string;

  @Column({ type: 'varchar', length: 64 })
  challengerId: string;

  /** shadowing | promoted | aborted — the lifecycle of the shadow. */
  @Column({ type: 'varchar', length: 16 })
  status: string;

  /** Append-only agree/disagree pairs recorded while shadowing. */
  @Column({ type: 'jsonb' })
  pairs: ShadowPair[];

  /** The frozen engine verdict, null until a legal evaluation was run. */
  @Column({ type: 'jsonb', nullable: true })
  result: ShadowResult | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
