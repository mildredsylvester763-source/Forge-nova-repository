// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/tool-call-record.entity.ts
// ============================================================================
// One row per normalized tool call (FORGE AI-056). openai / anthropic /
// generic provider shapes are canonicalized to ONE stored shape; the tc_
// fingerprint is invariant to argument key order. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NormalizedToolCall } from '../engine/model-gateway-ops-engine';

@Entity('tool_call_records')
@Index(['userId', 'providerId'])
export class ToolCallRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  providerId: string;

  /** tc_ fingerprint over provider:name:canonical args. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  /** Normalized: provider, name, args, fingerprint. */
  @Column({ type: 'jsonb' })
  call: NormalizedToolCall;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
