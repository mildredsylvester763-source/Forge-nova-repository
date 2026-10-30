import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('review_requests')
@Index(['ownerUserId', 'customerRef'])
export class ReviewRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'text' })
  customerRef: string;

  @Column({ type: 'text' })
  customerName: string;

  @Column({ type: 'text' })
  channel: string;

  @Column({ type: 'text', default: 'recorded' })
  status: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
