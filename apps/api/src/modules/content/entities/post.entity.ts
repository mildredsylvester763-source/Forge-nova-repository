import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('posts')
@Index(['userId', 'slug'], { unique: true })
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', default: 'draft' })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
