import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Live agent testing session (FORGE TQ-001). One AI-driven session against a
// real app: platform, plain-language goal, persona, environment, safe mode
// and the status the lifecycle engine enforces. Rows are append-only audit
// records of what was tested and under which law.

@Entity('live_test_sessions')
@Index(['userId', 'createdAt'])
export class TestSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64, default: 'default' })
  workspace: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 1000 })
  goal: string;

  @Column({ type: 'varchar', length: 16 })
  platform: string;

  @Column({ type: 'varchar', length: 16, default: 'planned' })
  status: string;

  @Column({ type: 'varchar', length: 16, default: 'staging' })
  environment: string;

  @Column({ type: 'boolean', default: true })
  safeMode: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  persona: string | null;

  @Column({ type: 'jsonb', default: {} })
  deviceProfile: unknown;

  @Column({ type: 'jsonb', default: [] })
  goalTasks: unknown[];

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
