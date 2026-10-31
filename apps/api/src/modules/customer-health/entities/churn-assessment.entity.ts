import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('churn_assessments')
@Index(['ownerUserId', 'customerRef'])
export class ChurnAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'text' })
  customerRef: string;

  @Column({ type: 'text' }) // low | medium | high
  band: string;

  @Column({ type: 'integer' })
  points: number;

  @Column({ type: 'text' }) // named factors joined with |
  factors: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
