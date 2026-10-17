// ============================================================================
// FILE: /apps/api/src/modules/integrations/entities/api-key.entity.ts
// ============================================================================

// API keys: generated once, shown once, stored ONLY as a SHA-256 hash.
// Scope list is pinned by the engine (read/write/mcp/webhooks). Revocation
// is a timestamp — a revoked key is history, not deletion.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('api_keys')
@Index(['userId', 'createdAt'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  keyHash: string;

  @Column({ type: 'jsonb', default: [] })
  scopes: string[];

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
