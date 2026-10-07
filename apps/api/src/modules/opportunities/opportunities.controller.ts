// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunities.controller.ts
// ============================================================================
// Zero-trust entry points. Every route requires an authenticated user; the
// userId is taken from the request context (set by the auth guard), NEVER
// from the body or query ÃÂ¢ÃÂÃÂ cross-tenant access is structurally impossible.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityQueryDto } from './dto/opportunity-query.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { OpportunityStatus, OpportunityPriority } from './enums';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: OpportunityQueryDto) {
    return this.opportunitiesService.findAll(req.user.id, query);
  }

  @Get('statistics')
  getStatistics(@Request() req: any) {
    return this.opportunitiesService.getStatistics(req.user.id);
  }

  @Get('scans')
  getScans(@Request() req: any, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: string) {
    return this.opportunitiesService.getScans(req.user.id, { page, limit, status });
  }

  @Post('scans')
  createScan(@Request() req: any, @Body() dto: CreateScanDto) {
    return this.opportunitiesService.createScan(req.user.id, dto, req);
  }

  @Post('scans/:id/trigger')
  triggerScan(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.triggerScan(req.user.id, id, req);
  }

  @Get('scans/:id')
  getScan(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.getScan(req.user.id, id);
  }

  @Delete('scans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteScan(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.deleteScan(req.user.id, id);
  }

  @Post('bulk-update')
  bulkUpdate(@Request() req: any, @Body() body: { ids: string[]; updates: UpdateOpportunityDto }) {
    return this.opportunitiesService.bulkUpdate(req.user.id, body.ids, body.updates, req);
  }

  @Post('bulk-delete')
  bulkDelete(@Request() req: any, @Body() body: { ids: string[] }) {
    return this.opportunitiesService.bulkDelete(req.user.id, body.ids, req);
  }

  @Post('bulk-status')
  bulkChangeStatus(
    @Request() req: any,
    @Body() body: { ids: string[]; status: OpportunityStatus; reason?: string },
  ) {
    return this.opportunitiesService.bulkChangeStatus(req.user.id, body.ids, body.status, body.reason, req);
  }

  @Post('recalculate-scores')
  recalculateScores(@Request() req: any) {
    return this.opportunitiesService.recalculateAllScores(req.user.id, req);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.findOne(req.user.id, id, req);
  }

  @Get(':id/history')
  getHistory(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.opportunitiesService.getHistory(req.user.id, id, { page, limit });
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(req.user.id, id, dto, req);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.remove(req.user.id, id, req);
  }

  @Post(':id/restore')
  restore(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.restore(req.user.id, id, req);
  }

  @Patch(':id/status')
  changeStatus(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: OpportunityStatus; reason?: string },
  ) {
    return this.opportunitiesService.changeStatus(req.user.id, id, body.status, body.reason, req);
  }

  @Patch(':id/priority')
  changePriority(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { priority: OpportunityPriority; reason?: string },
  ) {
    return this.opportunitiesService.changePriority(req.user.id, id, body.priority, body.reason, req);
  }

  @Post(':id/favorite')
  toggleFavorite(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.toggleFavorite(req.user.id, id, req);
  }

  @Post(':id/watchers')
  addWatcher(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { watcherId: string }) {
    return this.opportunitiesService.addWatcher(req.user.id, id, body.watcherId, req);
  }

  @Delete(':id/watchers/:watcherId')
  removeWatcher(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('watcherId', ParseUUIDPipe) watcherId: string) {
    return this.opportunitiesService.removeWatcher(req.user.id, id, watcherId, req);
  }

  @Post(':id/score')
  score(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.opportunitiesService.scoreOpportunity(req.user.id, id);
  }
}
