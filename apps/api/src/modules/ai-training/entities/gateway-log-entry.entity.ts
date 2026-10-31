// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/gateway-log-entry.entity.ts
// ============================================================================
// One row per gateway prompt/response log (FORGE AI-053). Content is ALWAYS
// redacted before it reaches this table, and zero-retention workspaces store
// no content at all (contentOmitted). Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { GatewayLogValue } from '../engine/model-gateway-ops-engine';

@Entity('gateway_log_entries')
@Index(['userId', 'providerId'])
export class GatewayLogEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  providerId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** log_ fingerprint over provider:model:prompt:response (raw content). */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  /** Redacted entry; in zero-retention mode prompt/response stay empty. */
  @Column({ type: 'jsonb' })
  entry: GatewayLogValue;

  /** How many secrets redaction destroyed before storage. */
  @Column({ type: 'int', default: 0 })
  redactionCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
