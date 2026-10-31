import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Offline knowledge pack (FORGE AI-072). A curated, budgeted, checksummed
// topic set the user can carry offline. Packs are RECORDED artifacts: the
// checksum pins exactly which articles the pack contains.

@Entity('knowledge_packs')
@Index(['userId'])
export class KnowledgePack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'jsonb', default: [] })
  topics: string[];

  @Column({ type: 'int', default: 0 })
  sizeKb: number;

  @Column({ type: 'varchar', length: 8, default: '' })
  checksum: string;

  @Column({ type: 'jsonb', default: [] })
  articles: Record<string, unknown>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
