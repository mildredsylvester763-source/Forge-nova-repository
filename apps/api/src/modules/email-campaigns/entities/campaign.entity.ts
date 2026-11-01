import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A campaign is an HONEST record: it says a shop prepared this campaign with
// this subject and optionally this template. The status stays 'recorded'
// because no email adapter exists yet and nothing pretends to have been sent.
@Entity('email_campaigns')
@Index(['userId', 'name'], { unique: true })
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ type: 'text', default: 'recorded' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
