// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/provider-health.entity.ts
// ============================================================================
// One row per provider circuit health (FORGE AI-049): consecutive failures
// and the healthy flag. Three consecutive failures mark a provider
// unhealthy; one success resets the circuit. Failover never schedules an
// unhealthy provider. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ProviderHealthState } from '../engine/model-gateway-engine';

@Entity('provider_health')
@Index(['userId', 'providerId'])
export class ProviderHealth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  providerId: string;

  /** Frozen engine verdict: consecutiveFailures, healthy. */
  @Column({ type: 'jsonb' })
  health: ProviderHealthState;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
