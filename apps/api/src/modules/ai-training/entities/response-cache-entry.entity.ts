// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/response-cache-entry.entity.ts
// ============================================================================
// One cached model response (FORGE AI-040). The engine fingerprints the
// content (rc_...) so admission is idempotent; exact hits answer free and
// prefix reuse discounts input processing. Pinned entries are never
// evicted by the LRU law. Zero-trust scoped: a cache row is visible only
// to its owning user and model — cross-model reads are misses, never leaks.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CacheEntry } from '../engine/model-operations-engine';

@Entity('response_cache_entries')
@Index(['userId', 'modelId'])
export class ResponseCacheEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** The engine-verdict frozen entry: prompt, tokens, pinned flag, times. */
  @Column({ type: 'jsonb' })
  entry: CacheEntry;

  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
