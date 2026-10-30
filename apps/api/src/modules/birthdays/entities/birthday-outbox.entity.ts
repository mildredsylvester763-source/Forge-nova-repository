import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('birthday_outbox')
@Index(['ownerUserId'])
@Index(['birthdayId'])
export class BirthdayOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  birthdayId: string;

  @Column({ type: 'text' })
  ownerUserId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'int' })
  sentYear: number;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
