// ============================================================================
// FILE: /apps/api/src/modules/integrations/entities/webhook-endpoint.entity.ts
// ============================================================================

// A user-owned webhook receiver: URL, signing secret, and the event
// patterns it subscribes to ('invoice.created', 'invoice.*', 'all').

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('webhook_endpoints')
@Index(['userId', 'url'], { unique: true })
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  secret: string;

  @Column({ type: 'jsonb', default: [] })
  events: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
