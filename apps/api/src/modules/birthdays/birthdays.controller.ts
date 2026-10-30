import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { BirthdaysService } from './birthdays.service';
import { UpsertBirthdayDto } from './dto/birthday.dto';

@Controller('birthdays')
export class BirthdaysController {
  constructor(private readonly birthdays: BirthdaysService) {}

  @Post()
  async upsert(@Request() req: any, @Body() dto: UpsertBirthdayDto) {
    return this.birthdays.upsertBirthday(req.user.id, dto.name, dto.birthMonthDay);
  }

  @Post(':id/check')
  async check(@Request() req: any, @Param('id') id: string) {
    const now = new Date();
    const monthDay =
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0');
    return this.birthdays.checkAndSend(req.user.id, id, {
      year: now.getFullYear(),
      monthDay,
    });
  }

  @Get('outbox')
  async outbox(@Request() req: any) {
    return this.birthdays.listOutbox(req.user.id);
  }

  @Get()
  async list(@Request() req: any) {
    return this.birthdays.listBirthdays(req.user.id);
  }
}
