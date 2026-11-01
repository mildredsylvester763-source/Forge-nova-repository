import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One recorded engagement fact: a recipient opened, clicked, bounced or
// unsubscribed, or a send was recorded. Metrics are computed from these raw
// facts only; no rate is ever stored or invented.
@Entity('email_campaign_events')
@Index(['userId', 'campaignId'])
export class CampaignEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  eventType: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
