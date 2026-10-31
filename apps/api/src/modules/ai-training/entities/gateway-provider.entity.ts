// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/gateway-provider.entity.ts
// ============================================================================
// One row per registered outside model provider (FORGE AI-048). The
// provider-neutral gateway routes by these descriptors: cheapest capable
// ACTIVE provider wins, inactive providers are named in the refusal list
// rather than silently dropped. Zero-trust scoped per user.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ProviderDescriptor } from '../engine/model-gateway-engine';

@Entity('gateway_providers')
@Index(['userId', 'providerId'])
export class GatewayProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  providerId: string;

  /** Frozen engine descriptor: rates, context window, active flag. */
  @Column({ type: 'jsonb' })
  provider: ProviderDescriptor;

  /** Deterministic content fingerprint — same descriptor, same row. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
