// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/provider-usage-sample.entity.ts
// ============================================================================
// One row per provider usage sample (FORGE AI-052) — the raw per-request
// truth (tokens in/out, latency, ok) that honest per-provider accounting
// aggregates. No smoothing, no sampling tricks. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UsageSample } from '../engine/model-gateway-engine';

@Entity('provider_usage_samples')
@Index(['userId', 'providerId'])
export class ProviderUsageSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  providerId: string;

  /** Raw sample: tokensIn, tokensOut, latencyMs, ok. */
  @Column({ type: 'jsonb' })
  sample: UsageSample;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
