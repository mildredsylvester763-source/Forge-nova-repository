// ============================================================================
// FILE: /apps/api/src/modules/notifications/notifications.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only. Static segments (unread-count, read-all) are declared
// BEFORE the :id routes so they can never be shadowed.

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('unread') unread?: string,
  ) {
    return this.notificationsService.findAll(req.user.id, {
      page: Number(page),
      limit: Number(limit),
      unreadOnly: unread === 'true',
    });
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.notificationsService.findAll(req.user.id, { limit: 1 }).then(r => ({ unread: r.unread }));
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@Request() req: any) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.remove(req.user.id, id);
  }
}
