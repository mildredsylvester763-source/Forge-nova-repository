// ============================================================================
// FILE: /apps/api/src/modules/experiments/experiments.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only. Static segments declared before :id routes.

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
import { ExperimentsService } from './experiments.service';
import { CreateExperimentDto, RecordObservationDto } from './dto/create-experiment.dto';
import { ExperimentStatus } from './entities/experiment.entity';

@Controller('experiments')
export class ExperimentsController {
  constructor(private readonly experimentsService: ExperimentsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateExperimentDto) {
    return this.experimentsService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: ExperimentStatus,
  ) {
    return this.experimentsService.findAll(req.user.id, { page: Number(page), limit: Number(limit), status });
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.experimentsService.findOne(req.user.id, id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.experimentsService.start(req.user.id, id);
  }

  @Post(':id/observations')
  @HttpCode(HttpStatus.OK)
  recordObservation(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordObservationDto) {
    return this.experimentsService.recordObservation(req.user.id, id, dto);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  decide(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.experimentsService.decide(req.user.id, id);
  }

  @Patch(':id/cancel')
  cancel(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { reason?: string }) {
    return this.experimentsService.cancel(req.user.id, id, body.reason);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.experimentsService.remove(req.user.id, id);
  }
}
