import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Birthday } from './entities/birthday.entity';
import { BirthdayOutbox } from './entities/birthday-outbox.entity';
import { BirthdaysController } from './birthdays.controller';
import { BirthdaysService } from './birthdays.service';

@Module({
  imports: [TypeOrmModule.forFeature([Birthday, BirthdayOutbox])],
  controllers: [BirthdaysController],
  providers: [BirthdaysService],
  exports: [BirthdaysService],
})
export class BirthdaysModule {}
