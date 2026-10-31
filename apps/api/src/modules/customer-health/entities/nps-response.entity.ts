import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('nps_responses')
@Index(['ownerUserId', 'customerRef'])
@Index(['ownerUserId', 'segment'])
export class NpsResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'text' })
  customerRef: string;

  @Column({ type: 'integer' })
  score: number;

  @Column({ type: 'text' }) // promoter | passive | detractor
  segment: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'text' }) // email | sms | link | in-app
  channel: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
