// ============================================================================
// FILE: /apps/api/src/modules/websites/entities/site-page.entity.ts
// ============================================================================

// A page belongs to one site and is built from simple section blocks. The
// slug is the page address and stays unique per site.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PageBlock } from '../engine/website-engine';

@Entity('site_pages')
@Index(['userId', 'siteId', 'slug'], { unique: true })
export class SitePage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  siteId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'simple-json' })
  blocks: PageBlock[];

  @Column({ type: 'integer' })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
