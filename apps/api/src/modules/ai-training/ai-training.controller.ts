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
  DefineEvalSuiteDto, GradeEvalSuiteDto, RecordPanelVoteDto, ShipGateDto,
  DefineSafetyBatteryDto, GradeSafetyRunDto, GroundClaimsDto,
  CheckContaminationDto, CastBlindVoteDto, TallyBlindVotesDto,
  DefineExperimentDto, AssignVariantDto, RecordExperimentOutcomeDto,
  TallyExperimentDto, RecordAgentEventDto, BuildScorecardsDto,
  RecordTrendSampleDto, BuildTrendDto, MineFailuresDto,
  RegisterModelDto, BuildModelCardDto, PromoteModelDto,
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

  // --- Eval harness (AI-021..024) ---
  // Static segments declared before :param routes.

  @Post('eval/suites')
  @HttpCode(HttpStatus.CREATED)
  defineEvalSuite(@Request() req: any, @Body() dto: DefineEvalSuiteDto) {
    return this.aiTrainingService.defineEvalSuite(req.user.id, dto);
  }

  @Get('eval/suites/:suiteId')
  getEvalSuite(
    @Request() req: any,
    @Param('suiteId') suiteId: string,
    @Query('version') version?: string,
  ) {
    return this.aiTrainingService.getEvalSuite(
      req.user.id,
      suiteId,
      version === undefined ? undefined : Number(version),
    );
  }

  @Post('eval/suites/:suiteId/grade')
  gradeEvalSuite(
    @Request() req: any,
    @Param('suiteId') suiteId: string,
    @Body() dto: GradeEvalSuiteDto,
  ) {
    return this.aiTrainingService.gradeEvalSuite(req.user.id, suiteId, dto);
  }

  @Post('eval/panels/votes')
  @HttpCode(HttpStatus.CREATED)
  recordPanelVote(@Request() req: any, @Body() dto: RecordPanelVoteDto) {
    return this.aiTrainingService.recordPanelVote(req.user.id, dto);
  }

  @Get('eval/panels/:suiteId/:caseId')
  aggregatePanelVotes(
    @Request() req: any,
    @Param('suiteId') suiteId: string,
    @Param('caseId') caseId: string,
    @Query('quorum') quorum = '3',
  ) {
    return this.aiTrainingService.aggregatePanelVotes(req.user.id, suiteId, caseId, Number(quorum));
  }

  @Post('eval/gate')
  applyShipGate(@Body() dto: ShipGateDto) {
    return this.aiTrainingService.applyShipGate(dto);
  }

  // --- Safety evals, grounding, contamination, blind comparison (AI-025..028) ---
  // Static segments declared before :param routes.

  @Post('safety/batteries')
  @HttpCode(HttpStatus.CREATED)
  defineSafetyBattery(@Request() req: any, @Body() dto: DefineSafetyBatteryDto) {
    return this.aiTrainingService.defineSafetyBattery(req.user.id, dto);
  }

  @Get('safety/batteries/:batteryId')
  getSafetyBattery(@Request() req: any, @Param('batteryId') batteryId: string) {
    return this.aiTrainingService.getSafetyBattery(req.user.id, batteryId);
  }

  @Post('safety/batteries/:batteryId/grade')
  gradeSafetyRun(
    @Request() req: any,
    @Param('batteryId') batteryId: string,
    @Body() dto: GradeSafetyRunDto,
  ) {
    return this.aiTrainingService.gradeSafetyRun(req.user.id, batteryId, dto);
  }

  @Post('safety/grounding')
  groundModelClaims(@Request() req: any, @Body() dto: GroundClaimsDto) {
    return this.aiTrainingService.groundModelClaims(req.user.id, dto);
  }

  @Post('safety/contamination')
  checkContamination(@Request() req: any, @Body() dto: CheckContaminationDto) {
    return this.aiTrainingService.checkContamination(req.user.id, dto);
  }

  @Post('blind/votes')
  @HttpCode(HttpStatus.CREATED)
  castBlindVote(@Request() req: any, @Body() dto: CastBlindVoteDto) {
    return this.aiTrainingService.castBlindVote(req.user.id, dto);
  }

  @Post('blind/tally')
  tallyBlindVotes(@Request() req: any, @Body() dto: TallyBlindVotesDto) {
    return this.aiTrainingService.tallyBlindVotes(req.user.id, dto);
  }

  // --- In-product A/B experiments, scorecards, trends, mining (AI-029..032) ---
  // Static segments declared before :param routes.

  @Post('experiments')
  @HttpCode(HttpStatus.CREATED)
  defineExperiment(@Request() req: any, @Body() dto: DefineExperimentDto) {
    return this.aiTrainingService.defineExperiment(req.user.id, dto);
  }

  @Get('experiments/:experimentId')
  getExperiment(@Request() req: any, @Param('experimentId') experimentId: string) {
    return this.aiTrainingService.getExperiment(req.user.id, experimentId);
  }

  @Post('experiments/:experimentId/assign')
  assignExperimentVariant(@Request() req: any, @Body() dto: AssignVariantDto) {
    return this.aiTrainingService.assignExperimentVariant(req.user.id, dto);
  }

  @Post('experiments/:experimentId/outcomes')
  recordExperimentOutcome(@Request() req: any, @Body() dto: RecordExperimentOutcomeDto) {
    return this.aiTrainingService.recordExperimentOutcome(req.user.id, dto);
  }

  @Post('experiments/:experimentId/tally')
  tallyExperiment(@Request() req: any, @Body() dto: TallyExperimentDto) {
    return this.aiTrainingService.tallyExperiment(req.user.id, dto);
  }

  @Post('agents/events')
  @HttpCode(HttpStatus.CREATED)
  recordAgentEvent(@Request() req: any, @Body() dto: RecordAgentEventDto) {
    return this.aiTrainingService.recordAgentEvent(req.user.id, dto);
  }

  @Post('agents/scorecards')
  buildAgentScorecards(@Request() req: any, @Body() dto: BuildScorecardsDto) {
    return this.aiTrainingService.buildAgentScorecards(req.user.id, dto);
  }

  @Post('eval-trend/samples')
  @HttpCode(HttpStatus.CREATED)
  recordTrendSample(@Request() req: any, @Body() dto: RecordTrendSampleDto) {
    return this.aiTrainingService.recordTrendSample(req.user.id, dto);
  }

  @Post('eval-trend')
  buildEvalTrend(@Request() req: any, @Body() dto: BuildTrendDto) {
    return this.aiTrainingService.buildEvalTrend(req.user.id, dto);
  }

  @Post('mining/failures')
  @HttpCode(HttpStatus.CREATED)
  mineFailureCases(@Request() req: any, @Body() dto: MineFailuresDto) {
    return this.aiTrainingService.mineFailureCases(req.user.id, dto);
  }

  // --- Model registry, cards, staged promotion (AI-033..035) ---
  // Static segments declared before :param routes.

  @Post('models/register')
  @HttpCode(HttpStatus.CREATED)
  registerModel(@Request() req: any, @Body() dto: RegisterModelDto) {
    return this.aiTrainingService.registerModel(req.user.id, dto);
  }

  @Post('models/cards')
  @HttpCode(HttpStatus.CREATED)
  buildCardForModel(@Request() req: any, @Body() dto: BuildModelCardDto) {
    return this.aiTrainingService.buildCardForModel(req.user.id, dto);
  }

  @Post('models/promote')
  promoteModelVersion(@Request() req: any, @Body() dto: PromoteModelDto) {
    return this.aiTrainingService.promoteModelVersion(req.user.id, dto);
  }

  @Get('models/:modelId')
  getModelVersions(@Request() req: any, @Param('modelId') modelId: string) {
    return this.aiTrainingService.getModelVersions(req.user.id, modelId);
  }
}
