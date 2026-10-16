// ============================================================================
// FILE: /apps/api/src/modules/audit/audit.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.
// Static routes are declared before any ':id' route.

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RecordAuditDto } from './dto/audit-log.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post()
  record(@Request() req: any, @Body() dto: RecordAuditDto) {
    return this.auditService.record(req.user.id, dto);
  }

  @Get()
  list(@Request() req: any, @Query('entity') entity?: string) {
    return this.auditService.list(req.user.id, entity);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.auditService.findOne(req.user.id, id);
  }
}
