import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Citation tracking (FORGE AI-059). Every web-derived claim must link to its
// https source. Claims are stored whitespace-normalized so the (user, claim,
// sourceUrl) triple is idempotent: binding the same claim to the same source
// twice never creates a second row.

@Entity('web_search_citations')
@Index(['userId', 'createdAt'])
export class CitationRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  claimText: string;

  @Column({ type: 'varchar', length: 2048 })
  sourceUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceTitle: string | null;

  @Column({ type: 'text', nullable: true })
  quote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
