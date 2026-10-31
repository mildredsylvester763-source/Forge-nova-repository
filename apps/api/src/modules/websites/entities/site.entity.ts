// ============================================================================
// FILE: /apps/api/src/modules/websites/entities/site.entity.ts
// ============================================================================

// A site is the business home on the web. It starts from a template, stays a
// draft until the owner publishes it, and remembers when it went live.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('sites')
@Index(['userId', 'name'], { unique: true })
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  template: string;

  @Column({ type: 'text', default: 'draft' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
