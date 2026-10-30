import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('credit_events')
@Index(['ownerUserId', 'customerRef'])
export class CreditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'text' })
  customerRef: string;

  @Column({ type: 'text' }) // limit-set | charge | release
  kind: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ type: 'integer' })
  usedAfterCents: number;

  @Column({ type: 'integer' })
  limitAfterCents: number;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
