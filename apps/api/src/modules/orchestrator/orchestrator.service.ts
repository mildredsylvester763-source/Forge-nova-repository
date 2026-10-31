// Orchestrator service (FORGE AI-073..078). The pure engines own every law;
// this service persists plans per user and refuses with the same named
// reasons the engines return. Sync wrappers throw BadRequestException for
// named refusals; async plan methods reject with the same message. A goal
// that classifies to no intent is stored as unclassified rather than
// refused, because a plan can be valid before its goal reads like anything.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrchestratorPlan } from './entities/orchestrator-plan.entity';
import { classifyIntent as classifyIntentEngine, INTENTS } from './engine/intent-classification';
import { editPlan as editPlanEngine, planTask as planTaskEngine, PLAN_ACTIONS } from './engine/task-planner';
import { previewPlan as previewPlanEngine } from './engine/plan-preview';
import { planHandoffs as planHandoffsEngine, AGENTS } from './engine/agent-selection';
import {
  checkToolPermission as checkToolPermissionEngine,
  TOOL_CLASSES,
  toolsForPlan as toolsForPlanEngine,
  TOOLS,
} from './engine/tool-registry';
import { runSandboxed as runSandboxedEngine } from './engine/execution-sandbox';
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

@Injectable()
export class OrchestratorService {
  constructor(
    @InjectRepository(OrchestratorPlan)
    private readonly plans: Repository<OrchestratorPlan>,
  ) {}

  listIntents(): string[] {
    return [...INTENTS];
  }

  listPlanActions(): string[] {
    return [...PLAN_ACTIONS];
  }

  listAgents(): string[] {
    return [...AGENTS];
  }

  listTools(): Array<{ name: string; cls: string; description: string }> {
    return TOOLS.map((t) => ({ name: t.name, cls: t.cls, description: t.description }));
  }

  listToolClasses(): string[] {
    return [...TOOL_CLASSES];
  }

  classifyIntent(dto: IntentClassifyDto) {
    const verdict = classifyIntentEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  previewPlan(dto: PlanPreviewDto) {
    const verdict = previewPlanEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  planHandoffs(dto: HandoffPlanDto) {
    const verdict = planHandoffsEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  checkToolPermission(dto: ToolCheckDto) {
    const verdict = checkToolPermissionEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  toolsForPlan(dto: ToolPlanDto) {
    const verdict = toolsForPlanEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  runSandboxed(dto: SandboxRunDto) {
    const verdict = runSandboxedEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  async createPlan(userId: string, dto: PlanTaskDto) {
    const explicit = typeof dto.intent === 'string' ? dto.intent.trim().toLowerCase() : '';
    if (explicit.length > 0 && !INTENTS.includes(explicit)) {
      throw new BadRequestException('plan-intent-unknown:' + explicit);
    }
    const planned = planTaskEngine(dto);
    if (!planned.ok) throw new BadRequestException(planned.reason);
    const preview = previewPlanEngine(dto);
    if (!preview.ok) throw new BadRequestException(preview.reason);
    let intent = explicit;
    if (intent.length === 0) {
      const classified = classifyIntentEngine({ text: dto.goal });
      intent = classified.ok && classified.intent ? classified.intent : 'unclassified';
    }
    const steps = (planned.steps ?? []) as unknown as OrchestratorPlan['steps'];
    const row = await this.plans.save(
      this.plans.create({
        userId,
        goal: planned.goal ?? '',
        intent,
        risk: preview.risk ?? 'low',
        estimatedCost: preview.estimatedCost ?? 0,
        requiresApproval: preview.requiresApproval ?? false,
        steps,
      }),
    );
    return {
      id: row.id,
      goal: row.goal,
      intent: row.intent,
      risk: row.risk,
      estimatedCost: row.estimatedCost,
      requiresApproval: row.requiresApproval,
      stepCount: steps.length,
      filesTouched: preview.filesTouched ?? [],
      steps: row.steps,
    };
  }

  async editPlan(userId: string, dto: PlanEditDto) {
    const row = await this.plans.findOne({ where: { userId, id: dto.planId } });
    if (!row) throw new BadRequestException('plan-not-found:' + dto.planId);
    const edited = editPlanEngine({ steps: row.steps, edits: dto.edits });
    if (!edited.ok) throw new BadRequestException(edited.reason);
    const preview = previewPlanEngine({ steps: edited.steps });
    if (!preview.ok) throw new BadRequestException(preview.reason);
    row.steps = (edited.steps ?? []) as unknown as OrchestratorPlan['steps'];
    row.risk = preview.risk ?? 'low';
    row.estimatedCost = preview.estimatedCost ?? 0;
    row.requiresApproval = preview.requiresApproval ?? false;
    const saved = await this.plans.save(row);
    return {
      id: saved.id,
      goal: saved.goal,
      intent: saved.intent,
      risk: saved.risk,
      estimatedCost: saved.estimatedCost,
      requiresApproval: saved.requiresApproval,
      steps: saved.steps,
      stepCount: (edited.steps ?? []).length,
    };
  }

  async listPlans(userId: string) {
    return this.plans.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async getPlan(userId: string, id: string) {
    const row = await this.plans.findOne({ where: { userId, id } });
    if (!row) throw new BadRequestException('plan-not-found:' + id);
    return row;
  }
}
