// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only. Static segments declared before :id routes.

import {
  Controller, Get, Post, Delete, Body, Param, Query, Request,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AiTrainingService } from './ai-training.service';
import {
  CreateTrainingAssetDto, BuildDatasetDto,
  CreateTrainingRunDto, TransitionRunDto, RecordRunCheckpointDto,
  RecordRunCostDto, RecordRunMetricDto, CompareRunsDto,
} from './dto/ai-training.dto';

@Controller('ai-training')
export class AiTrainingController {
  constructor(private readonly aiTrainingService: AiTrainingService) {}

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  createAsset(@Request() req: any, @Body() dto: CreateTrainingAssetDto) {
    return this.aiTrainingService.createAsset(req.user.id, dto);
  }

  @Get('assets')
  listAssets(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('kind') kind?: string,
    @Query('eligible') eligible?: string,
    @Query('search') search?: string,
  ) {
    return this.aiTrainingService.listAssets(req.user.id, {
      page: Number(page), limit: Number(limit), kind, search,
      eligible: eligible === undefined ? undefined : eligible === 'true',
    });
  }

  @Get('assets/:id')
  getAsset(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.aiTrainingService.getAsset(req.user.id, id);
  }

  @Delete('assets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAsset(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.aiTrainingService.removeAsset(req.user.id, id);
  }

  @Post('datasets')
  @HttpCode(HttpStatus.CREATED)
  buildDataset(@Request() req: any, @Body() dto: BuildDatasetDto) {
    return this.aiTrainingService.buildDataset(req.user.id, dto);
  }

  @Get('datasets')
  listDatasets(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('name') name?: string,
  ) {
    return this.aiTrainingService.listDatasets(req.user.id, {
      page: Number(page), limit: Number(limit), name,
    });
  }

  @Get('datasets/:id')
  getDataset(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.aiTrainingService.getDataset(req.user.id, id);
  }

  // --- Training runs (AI-013/014/017/018/019/020) ---

  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  createRun(@Request() req: any, @Body() dto: CreateTrainingRunDto) {
    return this.aiTrainingService.createRun(req.user.id, dto);
  }

  @Get('runs')
  listRuns(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('state') state?: string,
    @Query('datasetId') datasetId?: string,
  ) {
    return this.aiTrainingService.listRuns(req.user.id, {
      page: Number(page), limit: Number(limit), state, datasetId,
    });
  }

  @Post('runs/compare')
  compareRuns(@Request() req: any, @Body() dto: CompareRunsDto) {
    return this.aiTrainingService.compareRuns(req.user.id, dto);
  }

  @Get('runs/:id')
  getRun(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.aiTrainingService.getRun(req.user.id, id);
  }

  @Post('runs/:id/transition')
  transitionRun(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionRunDto,
  ) {
    return this.aiTrainingService.transitionRun(req.user.id, id, dto);
  }

  @Post('runs/:id/checkpoint')
  recordRunCheckpoint(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRunCheckpointDto,
  ) {
    return this.aiTrainingService.recordRunCheckpoint(req.user.id, id, dto);
  }

  @Post('runs/:id/cost')
  recordRunCost(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRunCostDto,
  ) {
    return this.aiTrainingService.recordRunCost(req.user.id, id, dto);
  }

  @Post('runs/:id/metrics')
  recordRunMetric(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRunMetricDto,
  ) {
    return this.aiTrainingService.recordRunMetric(req.user.id, id, dto);
  }
}
