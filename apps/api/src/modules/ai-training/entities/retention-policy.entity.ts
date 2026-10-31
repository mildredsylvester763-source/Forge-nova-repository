// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/retention-policy.entity.ts
// ============================================================================
// Per-workspace log retention policy (FORGE AI-054). mode zero means no
// prompt/response content is ever persisted; the policy decision row keeps
// the law that routing and logging both obey. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RetentionDecision } from '../engine/model-gateway-ops-engine';

@Entity('retention_policies')
@Index(['userId', 'workspaceId'])
export class RetentionPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  workspaceId: string;

  @Column({ type: 'varchar', length: 24 })
  mode: string;

  /** The engine decision: mode + persistContent + persistMetadata. */
  @Column({ type: 'jsonb' })
  policy: RetentionDecision;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
