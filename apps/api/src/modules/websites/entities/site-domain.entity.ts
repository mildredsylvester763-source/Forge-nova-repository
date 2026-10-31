// ============================================================================
// FILE: /apps/api/src/modules/websites/entities/site-domain.entity.ts
// ============================================================================

// A custom domain connected to a site. The owner proves control with a
// challenge TXT record at their DNS host; the row stays pending until the
// value they set matches the token exactly. Only verified domains can become
// the site primary.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('site_domains')
@Index(['userId', 'domain'], { unique: true })
export class SiteDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  siteId: string;

  @Column({ type: 'text' })
  domain: string;

  @Column({ type: 'text' })
  verificationToken: string;

  @Column({ type: 'text', default: 'pending' })
  status: string;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
