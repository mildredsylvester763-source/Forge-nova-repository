// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/entities/egress-call-log.entity.ts
// ============================================================================

// One row per completed outbound execution. Request headers are stored
// redacted (secret headers become 'redacted'); the raw credential is never
// written here.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('egress_call_logs')
@Index(['userId', 'createdAt'])
@Index(['connectionId', 'createdAt'])
export class EgressCallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  connectionId: string;

  @Column({ type: 'text' })
  method: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'jsonb', default: {} })
  requestHeadersRedacted: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true })
  requestBody?: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  statusCode?: number | null;

  @Column({ type: 'text', default: 'failed' })
  outcome: string;

  @Column({ type: 'int', default: 1 })
  attempts: number;

  @Column({ type: 'int', nullable: true })
  latencyMs?: number | null;

  @Column({ type: 'text', nullable: true })
  errorText?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
