// ============================================================================
// FILE: /apps/api/src/modules/audit/entities/audit-log.entity.ts
// ============================================================================

// Append-only audit trail. Rows are created, never updated: the diff is
// frozen at the moment of the change.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AuditChange } from '../engine/audit-diff';

@Entity('audit_logs')
@Index(['userId', 'entity', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Entity table name, e.g. 'invoices'. */
  @Column({ type: 'text' })
  entity: string;

  @Column({ type: 'uuid' })
  entityId: string;

  /** 'create' | 'update' | 'delete' | custom. */
  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'jsonb', default: [] })
  changes: AuditChange[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
