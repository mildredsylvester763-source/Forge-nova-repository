// Task runtime service (FORGE AI-079..083). The pure engines own every law;
// this service persists task runs per user and refuses with the same named
// reasons the engines return. Sync wrappers throw BadRequestException for
// named refusals, except step validation, where failed checks are a verdict
// to report, not a refusal to throw; only reason-bearing results refuse.
// A run is created with a task-created event at sequence 1, and every
// recorded event is appended through the journal engine so the persisted
// history stays contiguous and replayable.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskRun } from './entities/task-run.entity';
import { STEP_CHECK_TYPES, validateStep as validateStepEngine } from './engine/step-validation';
import {
  APPROVAL_RISK_LEVELS,
  APPROVAL_TOOL_CLASSES,
  planApproval as planApprovalEngine,
  resolveApproval as resolveApprovalEngine,
} from './engine/approval-gates';
import {
  applyTaskCommand as applyTaskCommandEngine,
  TASK_COMMANDS,
  TASK_STATES,
} from './engine/task-control';
import {
  appendTaskEvent as appendTaskEventEngine,
  replayTask as replayTaskEngine,
  TASK_EVENT_TYPES,
} from './engine/task-history';
import { detectParallelConflicts as detectParallelConflictsEngine, PARALLEL_MODES } from './engine/parallel-agents';
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

@Injectable()
export class TaskRuntimeService {
  constructor(
    @InjectRepository(TaskRun)
    private readonly runs: Repository<TaskRun>,
  ) {}

  listStepCheckTypes(): string[] {
    return [...STEP_CHECK_TYPES];
  }

  listApprovalRiskLevels(): string[] {
    return [...APPROVAL_RISK_LEVELS];
  }

  listApprovalToolClasses(): string[] {
    return [...APPROVAL_TOOL_CLASSES];
  }

  listTaskStates(): string[] {
    return [...TASK_STATES];
  }

  listTaskCommands(): string[] {
    return [...TASK_COMMANDS];
  }

  listTaskEventTypes(): string[] {
    return [...TASK_EVENT_TYPES];
  }

  listParallelModes(): string[] {
    return [...PARALLEL_MODES];
  }

  validateStep(dto: StepValidateDto) {
    const verdict = validateStepEngine(dto);
    if (verdict.reason) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  planApproval(dto: ApprovalPlanDto) {
    const verdict = planApprovalEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  resolveApproval(dto: ApprovalResolveDto) {
    const verdict = resolveApprovalEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  applyTaskCommand(dto: TaskCommandDto) {
    const verdict = applyTaskCommandEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  detectParallelConflicts(dto: ParallelConflictsDto) {
    const verdict = detectParallelConflictsEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  async createTask(userId: string, dto: TaskCreateDto) {
    const appended = appendTaskEventEngine({ events: [], event: { type: 'task-created' } });
    if (!appended.ok) throw new BadRequestException(appended.reason);
    const events = (appended.events ?? []) as unknown as TaskRun['events'];
    const row = await this.runs.save(
      this.runs.create({
        userId,
        goal: dto.goal ?? '',
        state: 'running',
        events,
      }),
    );
    return {
      id: row.id,
      goal: row.goal,
      state: row.state,
      eventCount: events.length,
      events: row.events,
    };
  }

  async recordEvent(userId: string, dto: TaskRecordEventDto) {
    const row = await this.runs.findOne({ where: { userId, id: dto.runId } });
    if (!row) throw new BadRequestException('task-run-not-found:' + dto.runId);
    const appended = appendTaskEventEngine({
      events: row.events,
      event: { type: dto.type, stepId: dto.stepId, gateId: dto.gateId },
    });
    if (!appended.ok) throw new BadRequestException(appended.reason);
    const events = (appended.events ?? []) as unknown as TaskRun['events'];
    const replay = replayTaskEngine({ events });
    row.events = events;
    row.state = replay.ok ? replay.state ?? 'running' : row.state;
    const saved = await this.runs.save(row);
    return {
      id: saved.id,
      seq: appended.seq,
      state: saved.state,
      eventCount: events.length,
    };
  }

  async replayRun(userId: string, dto: TaskReplayDto) {
    const row = await this.runs.findOne({ where: { userId, id: dto.runId } });
    if (!row) throw new BadRequestException('task-run-not-found:' + dto.runId);
    const verdict = replayTaskEngine({ events: row.events, toSeq: dto.toSeq });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  async listRuns(userId: string) {
    return this.runs.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
  }
}
