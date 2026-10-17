// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/entities/egress-connection.entity.ts
// ============================================================================

// A universal outbound connection: one row per user per external system.
// Credentials live ONLY as a sealed AES-256-GCM envelope; the fingerprints
// jsonb carries short display fingerprints so logs can identify a
// credential without ever recovering it.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('egress_connections')
@Index(['userId', 'destinationId'])
@Index(['userId', 'createdAt'])
export class EgressConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  destinationId: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'text' })
  credentialsEnvelope: string;

  @Column({ type: 'jsonb', default: {} })
  credentialFingerprints: Record<string, string>;

  @Column({ type: 'text' })
  baseUrl: string;

  @Column({ type: 'text', default: 'connected' })
  status: string;

  @Column({ type: 'text', default: 'unknown' })
  healthStatus: string;

  @Column({ type: 'int', default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'int', default: 0 })
  consecutiveSuccesses: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastProbedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
