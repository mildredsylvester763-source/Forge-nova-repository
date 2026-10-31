import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Recorded workspace content item (FORGE AI-063). Retrieval runs over these
// rows: code, docs, issues, chats and assets a user recorded. Links point at
// other items the same user recorded EARLIER and give the hybrid graph lane
// meaning. Rows are append-only; searches never mutate them.

@Entity('workspace_content_items')
@Index(['userId', 'createdAt'])
export class WorkspaceContentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'docs' })
  source: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 5000 })
  body: string;

  @Column({ type: 'jsonb', default: [] })
  links: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
