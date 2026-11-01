import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { TaskRuntimeService } from './task-runtime.service';
import {
  ApprovalPlanDto,
  ApprovalResolveDto,
  ParallelConflictsDto,
  StepValidateDto,
  TaskCommandDto,
  TaskCreateDto,
  TaskRecordEventDto,
  TaskReplayDto,
} from './dto/task-runtime.dto';

@Controller('task-runtime')
export class TaskRuntimeController {
  constructor(private readonly service: TaskRuntimeService) {}

  @Get('step/checks')
  listStepCheckTypes() {
    return { checks: this.service.listStepCheckTypes() };
  }

  @Get('approval/risks')
  listApprovalRiskLevels() {
    return { risks: this.service.listApprovalRiskLevels() };
  }

  @Get('approval/tool-classes')
  listApprovalToolClasses() {
    return { toolClasses: this.service.listApprovalToolClasses() };
  }

  @Get('task/states')
  listTaskStates() {
    return { states: this.service.listTaskStates() };
  }

  @Get('task/commands')
  listTaskCommands() {
    return { commands: this.service.listTaskCommands() };
  }

  @Get('task/events')
  listTaskEventTypes() {
    return { events: this.service.listTaskEventTypes() };
  }

  @Get('parallel/modes')
  listParallelModes() {
    return { modes: this.service.listParallelModes() };
  }

  @Post('step/validate')
  validateStep(@Body() dto: StepValidateDto) {
    return this.service.validateStep(dto);
  }

  @Post('approval/plan')
  planApproval(@Body() dto: ApprovalPlanDto) {
    return this.service.planApproval(dto);
  }

  @Post('approval/resolve')
  resolveApproval(@Body() dto: ApprovalResolveDto) {
    return this.service.resolveApproval(dto);
  }

  @Post('task/command')
  applyTaskCommand(@Body() dto: TaskCommandDto) {
    return this.service.applyTaskCommand(dto);
  }

  @Post('parallel/conflicts')
  detectParallelConflicts(@Body() dto: ParallelConflictsDto) {
    return this.service.detectParallelConflicts(dto);
  }

  @Post('runs')
  async createTask(@Request() req: { user: { id: string } }, @Body() dto: TaskCreateDto) {
    return this.service.createTask(req.user.id, dto);
  }

  @Post('runs/event')
  async recordEvent(@Request() req: { user: { id: string } }, @Body() dto: TaskRecordEventDto) {
    return this.service.recordEvent(req.user.id, dto);
  }

  @Post('runs/replay')
  async replayRun(@Request() req: { user: { id: string } }, @Body() dto: TaskReplayDto) {
    return this.service.replayRun(req.user.id, dto);
  }

  @Get('runs')
  async listRuns(@Request() req: { user: { id: string } }) {
    return this.service.listRuns(req.user.id);
  }
}
