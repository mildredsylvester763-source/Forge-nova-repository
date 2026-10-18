import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('referral_rewards')
@Index(['referrerId'])
export class ReferralReward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referrerId: string;

  @Column({ type: 'uuid' })
  refereeId: string;

  @Column({ type: 'int' })
  purchaseCents: number;

  @Column({ type: 'int' })
  points: number;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
