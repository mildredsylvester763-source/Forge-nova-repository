import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Clean extraction of a fetched page (FORGE AI-058). One row per user per
// url: boilerplate stripped, readable text stored with a word count, plus the
// published date when the page exposes one and its freshness band (AI-060).

@Entity('web_search_pages')
@Index(['userId', 'url'], { unique: true })
export class FetchedPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'varchar', length: 255 })
  domain: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Column({ type: 'int', default: 0 })
  wordCount: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  freshnessBand: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
