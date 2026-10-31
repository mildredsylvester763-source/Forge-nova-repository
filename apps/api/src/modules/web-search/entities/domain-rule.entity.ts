import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Per-workspace domain allow and deny lists (FORGE AI-061). One row per user
// per workspace. Evaluation law: deny always wins over allow; an empty allow
// list means everything is allowed (subject to deny); a bare domain matches
// the host and any subdomain; a wildcard pattern matches subdomains only.

@Entity('web_search_domain_rules')
@Index(['userId', 'workspace'], { unique: true })
export class DomainRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64, default: 'default' })
  workspace: string;

  @Column({ type: 'jsonb', default: [] })
  allow: string[];

  @Column({ type: 'jsonb', default: [] })
  deny: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
