// ============================================================================
// FILE: /apps/api/src/modules/integrations/entities/integration.entity.ts
// ============================================================================

// A user's connection to a catalog connector. Credentials are stored as
// given, per user; status is engine-visible truth ('connected' is only
// written after validateCredentials accepts).

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('integrations')
@Index(['userId', 'connectorId'], { unique: true })
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  connectorId: string;

  @Column({ type: 'text', default: 'connected' })
  status: 'connected' | 'error' | 'disconnected';

  @Column({ type: 'jsonb', default: {} })
  credentials: Record<string, string>;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
