import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('birthdays')
@Index(['ownerUserId', 'name'], { unique: true })
export class Birthday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  ownerUserId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  birthMonthDay: string;

  @Column({ type: 'int', nullable: true })
  lastSentYear: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
