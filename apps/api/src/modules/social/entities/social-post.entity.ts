import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('social_posts')
@Index(['userId', 'status'])
export class SocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'simple-json' })
  platforms: string[];

  @Column({ type: 'text', default: 'scheduled' })
  status: string;

  @Column({ type: 'timestamp' })
  plannedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
