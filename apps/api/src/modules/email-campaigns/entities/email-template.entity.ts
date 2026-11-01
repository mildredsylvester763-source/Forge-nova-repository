import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A reusable email template in the drag and drop block model: an ordered
// list of blocks plus a subject line, both able to carry merge variables
// like {{first_name}}. Templates are drafts until published, and publishing
// is a one-way door.
@Entity('email_templates')
@Index(['userId', 'name'], { unique: true })
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'simple-json' })
  blocksJson: string;

  @Column({ type: 'text', default: 'draft' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
