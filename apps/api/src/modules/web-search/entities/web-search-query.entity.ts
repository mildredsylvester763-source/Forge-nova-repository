import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Web search query audit row (FORGE AI-057). Every search the tool runs is
// persisted with its ranked results, the results that were skipped and why,
// or the named reason the search refused. Rows are append-only audit records.

@Entity('web_search_queries')
@Index(['userId', 'createdAt'])
export class WebSearchQuery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64, default: 'default' })
  workspace: string;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'jsonb', default: [] })
  results: unknown[];

  @Column({ type: 'jsonb', default: [] })
  skipped: unknown[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  refusedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
