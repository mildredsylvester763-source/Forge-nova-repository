import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Search cache entry (FORGE AI-070). One cached search result per user and
// normalized key, with GPTCache-style tiering: fresh while young, stale but
// usable until the TTL, expired after. Hit counting is per entry.

@Entity('search_cache_entries')
@Index(['userId', 'cacheKey'])
export class SearchCacheEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  cacheKey: string;

  @Column({ type: 'varchar', length: 32, default: 'web' })
  lane: string;

  @Column({ type: 'jsonb', default: [] })
  payload: Record<string, unknown>[];

  @Column({ type: 'int', default: 0 })
  hitCount: number;

  @Column({ type: 'int', default: 300 })
  ttlSeconds: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
