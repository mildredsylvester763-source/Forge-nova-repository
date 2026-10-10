// ============================================================================
// FILE: /apps/api/src/modules/recurring/recurring.controller.ts
// ============================================================================
// Zero-trust entry points. Static segments are declared before :id routes so
// Nest never mistakes a fixed word for a UUID.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { CreateRecurringProfileDto } from './dto/create-recurring-profile.dto';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurringService: RecurringService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateRecurringProfileDto) {
    return this.recurringService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query('active') active?: string) {
    const activeOnly = active === undefined ? undefined : active === 'true';
    return this.recurringService.findAll(req.user.id, activeOnly);
  }

  @Get('due')
  findDue(@Request() req: any) {
    return this.recurringService.findDue(req.user.id);
  }

  @Post('run-due')
  @HttpCode(HttpStatus.OK)
  runDue(@Request() req: any) {
    return this.recurringService.runDue(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurringService.findOne(req.user.id, id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  run(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurringService.run(req.user.id, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurringService.pause(req.user.id, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurringService.resume(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurringService.remove(req.user.id, id);
  }
}
