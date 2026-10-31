// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/byok-key.entity.ts
// ============================================================================
// One row per workspace BYOK registration (FORGE AI-050). THE RAW KEY IS
// NEVER STORED — only its deterministic fingerprint and metadata. The
// same key re-registered is idempotent by fingerprint; a different key
// for the same provider replaces the row with a new fingerprint.
// Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ByokKeyMeta } from '../engine/model-gateway-engine';

@Entity('byok_keys')
@Index(['userId', 'providerId'])
export class ByokKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  workspaceId: string;

  @Column({ type: 'varchar', length: 64 })
  providerId: string;

  /** byok_ fingerprint — the identity of the key, never the key. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  /** Metadata only: providerId, keyLength, fingerprint. */
  @Column({ type: 'jsonb' })
  key: ByokKeyMeta;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
