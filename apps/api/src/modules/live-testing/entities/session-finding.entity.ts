import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Session finding (FORGE TQ-017). A bug report raised from a live session:
// severity, title, repro steps, evidence and the suspected commit. Severity
// is a pinned 1..5 scale validated by the service, never a free string.

@Entity('live_test_findings')
@Index(['sessionId', 'severity'])
export class SessionFinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'integer' })
  severity: number;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'jsonb', default: [] })
  reproSteps: unknown[];

  @Column({ type: 'jsonb', default: {} })
  evidence: unknown;

  @Column({ type: 'varchar', length: 40, nullable: true })
  suspectedCommit: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
