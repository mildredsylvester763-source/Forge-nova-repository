import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Recorded research report (FORGE AI-066). A finished investigation is
// persisted with its findings separated into verified (two or more sources)
// and unverified. A report is only ever RECORDED for the user: nothing in
// this module claims it was published, shared or delivered anywhere.

@Entity('workspace_research_reports')
@Index(['userId', 'createdAt'])
export class ResearchReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  topic: string;

  @Column({ type: 'varchar', length: 1000 })
  summary: string;

  @Column({ type: 'jsonb', default: [] })
  findings: unknown[];

  @Column({ type: 'int', default: 0 })
  verifiedCount: number;

  @Column({ type: 'int', default: 0 })
  unverifiedCount: number;

  @Column({ type: 'jsonb', default: [] })
  openQuestions: unknown[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
