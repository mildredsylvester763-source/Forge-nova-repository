import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import {
  HandoffPlanDto,
  IntentClassifyDto,
  PlanEditDto,
  PlanPreviewDto,
  PlanTaskDto,
  SandboxRunDto,
  ToolCheckDto,
  ToolPlanDto,
} from './dto/orchestrator.dto';

@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly service: OrchestratorService) {}

  @Get('intents')
  listIntents() {
    return { intents: this.service.listIntents() };
  }

  @Get('plan-actions')
  listPlanActions() {
    return { actions: this.service.listPlanActions() };
  }

  @Get('agents')
  listAgents() {
    return { agents: this.service.listAgents() };
  }

  @Get('tools')
  listTools() {
    return { tools: this.service.listTools() };
  }

  @Get('tool-classes')
  listToolClasses() {
    return { classes: this.service.listToolClasses() };
  }

  @Post('intent')
  classifyIntent(@Body() dto: IntentClassifyDto) {
    return this.service.classifyIntent(dto);
  }

  @Post('plan')
  async createPlan(@Request() req: { user: { id: string } }, @Body() dto: PlanTaskDto) {
    return this.service.createPlan(req.user.id, dto);
  }

  @Post('plan/edit')
  async editPlan(@Request() req: { user: { id: string } }, @Body() dto: PlanEditDto) {
    return this.service.editPlan(req.user.id, dto);
  }

  @Post('preview')
  previewPlan(@Body() dto: PlanPreviewDto) {
    return this.service.previewPlan(dto);
  }

  @Post('handoffs')
  planHandoffs(@Body() dto: HandoffPlanDto) {
    return this.service.planHandoffs(dto);
  }

  @Post('tools/check')
  checkToolPermission(@Body() dto: ToolCheckDto) {
    return this.service.checkToolPermission(dto);
  }

  @Post('tools/plan')
  toolsForPlan(@Body() dto: ToolPlanDto) {
    return this.service.toolsForPlan(dto);
  }

  @Post('sandbox')
  runSandboxed(@Body() dto: SandboxRunDto) {
    return this.service.runSandboxed(dto);
  }

  @Get('plans')
  async listPlans(@Request() req: { user: { id: string } }) {
    return this.service.listPlans(req.user.id);
  }

  @Get('plans/:id')
  async getPlan(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.getPlan(req.user.id, id);
  }
}
