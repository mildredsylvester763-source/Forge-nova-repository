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
  PlanServingScaleDto, BuildQuantizationDto, BuildBundleDto,
  RoutePromptDto,
  CacheLookupDto, CacheAdmitDto,
  StreamOpenDto, StreamChunkDto, StreamLifecycleDto, StreamResumeDto,
  MetricSampleDto, AggregateMetricsDto,
  ShadowCreateDto, ShadowPairDto, ShadowEvaluateDto,
  RollbackDto,
  PinModelDto, UnpinModelDto, ResolveModelDto,
  ReserveInstancesDto, ReleaseInstancesDto,
  PackageBuildDto, ReimportVerifyDto,
  RegisterProviderDto, GatewayRouteDto, RecordOutcomeDto, FailoverPlanDto,
  ByokRegisterDto, PolicyCheckDto, UsageRecordDto,
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

  // --- Model serving: scale, quantization, on-device bundles, routing (AI-036..039) ---
  // Static segments declared before :param routes.

  @Post('serving/scale')
  planServingScale(@Request() req: any, @Body() dto: PlanServingScaleDto) {
    return this.aiTrainingService.planServingScale(req.user.id, dto);
  }

  @Get('serving/scale/:modelId')
  getServingScalePlans(@Request() req: any, @Param('modelId') modelId: string) {
    return this.aiTrainingService.getServingScalePlans(req.user.id, modelId);
  }

  @Post('serving/quantize')
  buildQuantization(@Request() req: any, @Body() dto: BuildQuantizationDto) {
    return this.aiTrainingService.buildQuantization(req.user.id, dto);
  }

  @Post('serving/bundles')
  @HttpCode(HttpStatus.CREATED)
  buildBundle(@Request() req: any, @Body() dto: BuildBundleDto) {
    return this.aiTrainingService.buildBundle(req.user.id, dto);
  }

  @Post('serving/route')
  routePrompt(@Request() req: any, @Body() dto: RoutePromptDto) {
    return this.aiTrainingService.routePrompt(req.user.id, dto);
  }

  @Get('serving/routing-decisions')
  listRoutingDecisions(@Request() req: any) {
    return this.aiTrainingService.listRoutingDecisions(req.user.id);
  }

  // --- Model operations: cache, streaming, metrics, shadow, rollback (AI-040..044) ---
  // Static segments declared before :param routes.

  @Post('serving/cache/lookup')
  lookupResponse(@Request() req: any, @Body() dto: CacheLookupDto) {
    return this.aiTrainingService.lookupResponse(req.user.id, dto);
  }

  @Post('serving/cache/admit')
  @HttpCode(HttpStatus.CREATED)
  admitResponseCache(@Request() req: any, @Body() dto: CacheAdmitDto) {
    return this.aiTrainingService.admitResponseCache(req.user.id, dto);
  }

  @Get('serving/cache/entries')
  listCacheEntries(@Request() req: any, @Query('modelId') modelId?: string) {
    return this.aiTrainingService.listCacheEntries(req.user.id, modelId);
  }

  @Post('serving/streams/open')
  @HttpCode(HttpStatus.CREATED)
  openStream(@Request() req: any, @Body() dto: StreamOpenDto) {
    return this.aiTrainingService.openStream(req.user.id, dto);
  }

  @Post('serving/streams/chunk')
  appendStreamChunk(@Request() req: any, @Body() dto: StreamChunkDto) {
    return this.aiTrainingService.appendStreamChunk(req.user.id, dto);
  }

  @Post('serving/streams/cancel')
  cancelStream(@Request() req: any, @Body() dto: StreamLifecycleDto) {
    return this.aiTrainingService.cancelStream(req.user.id, dto);
  }

  @Post('serving/streams/complete')
  completeStream(@Request() req: any, @Body() dto: StreamLifecycleDto) {
    return this.aiTrainingService.completeStream(req.user.id, dto);
  }

  @Post('serving/streams/resume')
  resumeStream(@Request() req: any, @Body() dto: StreamResumeDto) {
    return this.aiTrainingService.resumeStream(req.user.id, dto);
  }

  @Get('serving/streams/:streamId')
  getStream(@Request() req: any, @Param('streamId') streamId: string) {
    return this.aiTrainingService.getStream(req.user.id, streamId);
  }

  @Post('serving/metrics/samples')
  @HttpCode(HttpStatus.CREATED)
  recordServingMetric(@Request() req: any, @Body() dto: MetricSampleDto) {
    return this.aiTrainingService.recordServingMetric(req.user.id, dto);
  }

  @Get('serving/metrics/samples')
  listServingMetricSamples(@Request() req: any, @Query('modelId') modelId?: string) {
    return this.aiTrainingService.listServingMetricSamples(req.user.id, modelId);
  }

  @Post('serving/metrics/aggregate')
  buildServingMetrics(@Request() req: any, @Body() dto: AggregateMetricsDto) {
    return this.aiTrainingService.buildServingMetrics(req.user.id, dto);
  }

  @Post('serving/shadow/create')
  @HttpCode(HttpStatus.CREATED)
  createShadowDeployment(@Request() req: any, @Body() dto: ShadowCreateDto) {
    return this.aiTrainingService.createShadowDeployment(req.user.id, dto);
  }

  @Post('serving/shadow/pair')
  recordShadowPair(@Request() req: any, @Body() dto: ShadowPairDto) {
    return this.aiTrainingService.recordShadowPair(req.user.id, dto);
  }

  @Post('serving/shadow/evaluate')
  evaluateShadowDeployment(@Request() req: any, @Body() dto: ShadowEvaluateDto) {
    return this.aiTrainingService.evaluateShadowDeployment(req.user.id, dto);
  }

  @Get('serving/shadow')
  listShadowDeployments(@Request() req: any, @Query('championId') championId?: string) {
    return this.aiTrainingService.listShadowDeployments(req.user.id, championId);
  }

  @Post('serving/rollback')
  rollbackModelVersion(@Request() req: any, @Body() dto: RollbackDto) {
    return this.aiTrainingService.rollbackModelVersion(req.user.id, dto);
  }

  @Get('serving/rollback-events')
  listRollbackEvents(@Request() req: any, @Query('modelId') modelId?: string) {
    return this.aiTrainingService.listRollbackEvents(req.user.id, modelId);
  }

  // --- Workspace model access: pins, dedicated instances, on-prem packages (AI-045..047) ---

  @Post('access/pins')
  pinWorkspaceModel(@Request() req: any, @Body() dto: PinModelDto) {
    return this.aiTrainingService.pinWorkspaceModel(req.user.id, dto);
  }

  @Post('access/pins/unpin')
  unpinWorkspaceModel(@Request() req: any, @Body() dto: UnpinModelDto) {
    return this.aiTrainingService.unpinWorkspaceModel(req.user.id, dto);
  }

  @Get('access/pins')
  listWorkspacePins(@Request() req: any, @Query('workspaceId') workspaceId?: string) {
    return this.aiTrainingService.listWorkspacePins(req.user.id, workspaceId);
  }

  @Post('access/resolve')
  resolveWorkspaceModel(@Request() req: any, @Body() dto: ResolveModelDto) {
    return this.aiTrainingService.resolveWorkspaceModel(req.user.id, dto);
  }

  @Post('instances/reserve')
  reserveDedicatedInstances(@Request() req: any, @Body() dto: ReserveInstancesDto) {
    return this.aiTrainingService.reserveDedicatedInstances(req.user.id, dto);
  }

  @Post('instances/release')
  releaseDedicatedInstances(@Request() req: any, @Body() dto: ReleaseInstancesDto) {
    return this.aiTrainingService.releaseDedicatedInstances(req.user.id, dto);
  }

  @Get('instances')
  listInstanceReservations(@Request() req: any, @Query('modelId') modelId?: string) {
    return this.aiTrainingService.listInstanceReservations(req.user.id, modelId);
  }

  @Post('packages/build')
  buildOnPremPackageForModel(@Request() req: any, @Body() dto: PackageBuildDto) {
    return this.aiTrainingService.buildOnPremPackageForModel(req.user.id, dto);
  }

  @Post('packages/verify-reimport')
  verifyOnPremReimport(@Request() req: any, @Body() dto: ReimportVerifyDto) {
    return this.aiTrainingService.verifyOnPremReimport(req.user.id, dto);
  }

  @Get('packages')
  listOnPremPackages(@Request() req: any, @Query('modelId') modelId?: string) {
    return this.aiTrainingService.listOnPremPackages(req.user.id, modelId);
  }
  // --- AI-048..052: provider-neutral model gateway, circuit health,
  // BYOK keys, data policy, honest accounting ---

  @Post('gateway/providers')
  @HttpCode(HttpStatus.CREATED)
  registerGatewayProvider(@Request() req: any, @Body() dto: RegisterProviderDto) {
    return this.aiTrainingService.registerGatewayProvider(req.user.id, dto);
  }

  @Get('gateway/providers')
  listGatewayProviders(@Request() req: any) {
    return this.aiTrainingService.listGatewayProviders(req.user.id);
  }

  @Post('gateway/route')
  routeGatewayRequest(@Request() req: any, @Body() dto: GatewayRouteDto) {
    return this.aiTrainingService.routeGatewayRequest(req.user.id, dto);
  }

  @Post('gateway/outcome')
  recordProviderOutcome(@Request() req: any, @Body() dto: RecordOutcomeDto) {
    return this.aiTrainingService.recordProviderOutcome(req.user.id, dto);
  }

  @Get('gateway/health')
  listProviderHealth(@Request() req: any) {
    return this.aiTrainingService.listProviderHealth(req.user.id);
  }

  @Post('gateway/failover')
  planGatewayFailover(@Request() req: any, @Body() dto: FailoverPlanDto) {
    return this.aiTrainingService.planGatewayFailover(req.user.id, dto);
  }

  @Post('gateway/byok')
  @HttpCode(HttpStatus.CREATED)
  registerWorkspaceKey(@Request() req: any, @Body() dto: ByokRegisterDto) {
    return this.aiTrainingService.registerWorkspaceKey(req.user.id, dto);
  }

  @Get('gateway/byok')
  listWorkspaceKeys(@Request() req: any, @Query('workspaceId') workspaceId: string) {
    return this.aiTrainingService.listWorkspaceKeys(req.user.id, workspaceId);
  }

  @Post('gateway/policy')
  checkDataPolicy(@Request() req: any, @Body() dto: PolicyCheckDto) {
    return this.aiTrainingService.checkDataPolicy(req.user.id, dto);
  }

  @Post('gateway/usage')
  @HttpCode(HttpStatus.CREATED)
  recordProviderUsage(@Request() req: any, @Body() dto: UsageRecordDto) {
    return this.aiTrainingService.recordProviderUsage(req.user.id, dto);
  }

  @Get('gateway/accounting')
  buildProviderAccounting(@Request() req: any, @Query('providerId') providerId: string) {
    return this.aiTrainingService.buildProviderAccounting(req.user.id, { providerId });
  }
}
