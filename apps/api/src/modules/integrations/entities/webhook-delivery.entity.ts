// ============================================================================
// FILE: /apps/api/src/modules/integrations/entities/webhook-delivery.entity.ts
// ============================================================================

// One queued/attempted webhook POST. Attempts follow the engine's backoff
// schedule; after the last attempt the row is 'exhausted' — it stays as an
// audit record, never silently retried forever.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

@Entity('webhook_deliveries')
@Index(['userId', 'endpointId', 'createdAt'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  endpointId: string;

  @Column({ type: 'text' })
  event: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'text', default: 'pending' })
  status: WebhookDeliveryStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'integer', nullable: true })
  lastResponseCode?: number;

  @Column({ type: 'timestamptz' })
  nextAttemptAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
