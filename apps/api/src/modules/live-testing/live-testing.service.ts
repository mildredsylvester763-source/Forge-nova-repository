import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestSession } from './entities/test-session.entity';
import { SessionStep } from './entities/session-step.entity';
import { SessionMessage } from './entities/session-message.entity';
import { SessionFinding } from './entities/session-finding.entity';
import { TestPersona } from './entities/test-persona.entity';
import { canHandBack, canTakeControl, isActing, transition } from './engine/session-lifecycle';
import { checkAction, isPlatform } from './engine/platform-capability';
import { evaluateStep, isEnvironment, resolveSafeMode } from './engine/safe-mode';
import { getPersona, listPersonas } from './engine/persona-profile';
import { narrate, parseGoal } from './engine/step-narration';
import { buildTimeline } from './engine/session-recording';
import { assembleBugReport } from './engine/bug-report';
import { convertSession } from './engine/test-conversion';
import { deviceCatalog, networkCatalog } from './engine/device-profile';
import {
  CreatePersonaDto,
  CreateSessionDto,
  PersonaIdDto,
  PostMessageDto,
  RecordStepDto,
  ReportFindingDto,
  SessionRefDto,
} from './dto/live-testing.dto';

// Live agent testing service (FORGE TQ-001..021, TQ-030). Sessions run
// against the real app under engine law: every state change is a legal
// lifecycle transition, every step is evaluated by safe mode FIRST and the
// platform vocabulary second (security before mechanics), and every
// refusal is a named BadRequestException, never a silent guess.

@Injectable()
export class LiveTestingService {
  constructor(
    @InjectRepository(TestSession)
    private readonly sessions: Repository<TestSession>,
    @InjectRepository(SessionStep)
    private readonly steps: Repository<SessionStep>,
    @InjectRepository(SessionMessage)
    private readonly messages: Repository<SessionMessage>,
    @InjectRepository(SessionFinding)
    private readonly findings: Repository<SessionFinding>,
    @InjectRepository(TestPersona)
    private readonly personas: Repository<TestPersona>,
  ) {}

  private workspaceOf(dto: { workspace?: string }): string {
    const w = typeof dto?.workspace === 'string' ? dto.workspace.trim() : '';
    return w.length > 0 ? w.slice(0, 64) : 'default';
  }

  private sessionIdOf(dto: { sessionId?: string }): string {
    const id = typeof dto?.sessionId === 'string' ? dto.sessionId.trim() : '';
    if (id.length === 0) {
      throw new BadRequestException('session-id-missing');
    }
    return id;
  }

  private async requireSession(userId: string, sessionId: string): Promise<TestSession> {
    const row = await this.sessions.findOne({ where: { id: sessionId } });
    if (!row || row.userId !== userId) {
      throw new BadRequestException('session-not-found:' + sessionId);
    }
    return row;
  }

  private async applyTransition(
    userId: string,
    dto: SessionRefDto,
    to: string,
  ): Promise<TestSession> {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    const verdict = transition(row.status, to);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'session-transition-refused');
    }
    row.status = to;
    if (to === 'running' && !row.startedAt) {
      row.startedAt = new Date();
    }
    if (to === 'completed' || to === 'failed' || to === 'cancelled') {
      row.endedAt = new Date();
    }
    return this.sessions.save(row);
  }

  async createSession(userId: string, dto: CreateSessionDto) {
    const workspace = this.workspaceOf(dto);
    const platform = dto?.platform;
    if (!isPlatform(platform)) {
      throw new BadRequestException('platform-unknown:' + String(platform));
    }
    const environment = isEnvironment(dto?.environment) ? dto.environment : 'staging';
    const decision = resolveSafeMode(dto?.safeMode, environment);
    const goal = parseGoal(dto?.goal);
    if (!goal.ok || !goal.tasks) {
      throw new BadRequestException(goal.reason ?? 'goal-invalid');
    }
    const tasks = goal.tasks;
    let persona: string | null = null;
    if (dto?.persona) {
      const verdict = getPersona(dto.persona);
      if (verdict.ok) {
        persona = verdict.profile?.name ?? null;
      } else {
        const personaName = dto.persona.trim().toLowerCase();
        const custom = await this.personas.findOne({
          where: { userId, workspace, name: personaName },
        });
        if (!custom) {
          throw new BadRequestException(verdict.reason ?? 'persona-invalid');
        }
        persona = custom.name;
      }
    }
    const title =
      typeof dto?.title === 'string' && dto.title.trim().length > 0
        ? dto.title.trim().slice(0, 200)
        : tasks[0].text.slice(0, 200);
    const row = await this.sessions.save(
      this.sessions.create({
        userId,
        workspace,
        title,
        goal: String(dto?.goal).slice(0, 1000),
        platform,
        status: 'planned',
        environment,
        safeMode: decision.safeMode,
        persona,
        deviceProfile: { platform },
        goalTasks: tasks,
      }),
    );
    return { ...row, forcedSafeMode: decision.forced };
  }

  async startSession(userId: string, dto: SessionRefDto) {
    return this.applyTransition(userId, dto, 'running');
  }

  async pauseSession(userId: string, dto: SessionRefDto) {
    return this.applyTransition(userId, dto, 'paused');
  }

  async resumeSession(userId: string, dto: SessionRefDto) {
    return this.applyTransition(userId, dto, 'running');
  }

  async completeSession(userId: string, dto: SessionRefDto) {
    return this.applyTransition(userId, dto, 'completed');
  }

  async failSession(userId: string, dto: SessionRefDto) {
    return this.applyTransition(userId, dto, 'failed');
  }

  async cancelSession(userId: string, dto: SessionRefDto) {
    return this.applyTransition(userId, dto, 'cancelled');
  }

  async takeControl(userId: string, dto: SessionRefDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    if (!canTakeControl(row.status)) {
      throw new BadRequestException('session-control-refused:' + row.status);
    }
    row.status = 'manual';
    return this.sessions.save(row);
  }

  async handBack(userId: string, dto: SessionRefDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    if (!canHandBack(row.status)) {
      throw new BadRequestException('session-handback-refused:' + row.status);
    }
    row.status = 'running';
    return this.sessions.save(row);
  }

  async recordStep(userId: string, dto: RecordStepDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    if (!isActing(row.status)) {
      throw new BadRequestException('session-not-acting:' + row.status);
    }
    const action = dto?.action;
    const intent = {
      action: action ?? '',
      target: dto?.target,
      payload: {
        value: dto?.value,
        direction: dto?.direction,
        key: dto?.key,
        count: dto?.count,
        extra: dto?.payload ?? {},
      },
    };
    const safeVerdict = evaluateStep(intent, row.safeMode);
    if (!safeVerdict.ok) {
      throw new BadRequestException(safeVerdict.reason ?? 'safe-mode-refused');
    }
    const platformCheck = checkAction(row.platform, action);
    if (!platformCheck.ok) {
      throw new BadRequestException(platformCheck.reason ?? 'platform-refused');
    }
    const narration = narrate({
      action,
      target: dto?.target,
      value: dto?.value,
      direction: dto?.direction,
      key: dto?.key,
      count: dto?.count,
    });
    if (!narration.ok) {
      throw new BadRequestException(narration.reason ?? 'narration-refused');
    }
    const existing = await this.steps.find({ where: { sessionId } });
    const seq = existing.length + 1;
    return this.steps.save(
      this.steps.create({
        sessionId,
        seq,
        actor: 'ai',
        action: action ?? '',
        target: dto?.target ?? null,
        narration: narration.text ?? '',
        payload: intent.payload,
        occurredAt: new Date(),
      }),
    );
  }

  async postMessage(userId: string, dto: PostMessageDto) {
    const sessionId = this.sessionIdOf(dto);
    await this.requireSession(userId, sessionId);
    const body = typeof dto?.body === 'string' ? dto.body.trim() : '';
    if (body.length === 0) {
      throw new BadRequestException('message-empty');
    }
    return this.messages.save(
      this.messages.create({ sessionId, role: 'human', body: body.slice(0, 2000) }),
    );
  }

  async reportFinding(userId: string, dto: ReportFindingDto) {
    const sessionId = this.sessionIdOf(dto);
    await this.requireSession(userId, sessionId);
    const severity = Number(dto?.severity);
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
      throw new BadRequestException('finding-severity-invalid');
    }
    const title = typeof dto?.title === 'string' ? dto.title.trim() : '';
    if (title.length === 0) {
      throw new BadRequestException('finding-title-missing');
    }
    let commit: string | null = null;
    if (dto?.suspectedCommit) {
      const candidate = String(dto.suspectedCommit).trim();
      if (!/^[0-9a-f]{7,40}$/.test(candidate)) {
        throw new BadRequestException('finding-commit-invalid');
      }
      commit = candidate;
    }
    return this.findings.save(
      this.findings.create({
        sessionId,
        severity,
        title,
        reproSteps: Array.isArray(dto?.reproSteps) ? dto.reproSteps : [],
        evidence:
          dto?.evidence && typeof dto.evidence === 'object' ? dto.evidence : {},
        suspectedCommit: commit,
      }),
    );
  }

  async getSession(userId: string, sessionId: string) {
    const row = await this.requireSession(userId, sessionId);
    const steps = await this.steps.find({ where: { sessionId } });
    const messages = await this.messages.find({ where: { sessionId } });
    const findings = await this.findings.find({ where: { sessionId } });
    return {
      session: row,
      stepCount: steps.length,
      messageCount: messages.length,
      findings,
    };
  }

  async listSessions(userId: string, limit?: string) {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.sessions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: n,
    });
  }

  async buildRecording(userId: string, sessionId: string) {
    const row = await this.requireSession(userId, sessionId);
    if (!row.startedAt) {
      throw new BadRequestException('recording-not-started');
    }
    const steps = await this.steps.find({
      where: { sessionId },
      order: { seq: 'ASC' },
    });
    const verdict = buildTimeline(
      row.startedAt,
      steps.map((s) => ({
        seq: s.seq,
        narration: s.narration,
        status: s.status,
        occurredAt: s.occurredAt ?? s.createdAt,
      })),
      [],
    );
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'recording-refused');
    }
    return { sessionId, events: verdict.events, durationMs: verdict.durationMs };
  }

  async assembleBugReportForSession(userId: string, sessionId: string) {
    const row = await this.requireSession(userId, sessionId);
    const findings = await this.findings.find({ where: { sessionId } });
    const latest = findings.length === 0 ? null : findings[findings.length - 1];
    if (!latest) {
      throw new BadRequestException('bugreport-none');
    }
    const steps = await this.steps.find({
      where: { sessionId },
      order: { seq: 'ASC' },
    });
    const reproRaw: unknown = latest.reproSteps;
    const reproJoined = Array.isArray(reproRaw)
      ? reproRaw.filter((p): p is string => typeof p === 'string').join(' ')
      : '';
    const evidenceRaw: unknown = latest.evidence;
    const evidenceText =
      evidenceRaw !== null &&
      typeof evidenceRaw === 'object' &&
      Object.keys(evidenceRaw).length > 0
        ? JSON.stringify(evidenceRaw)
        : null;
    const verdict = assembleBugReport(
      sessionId,
      {
        platform: row.platform,
        environment: row.environment,
        safeMode: row.safeMode,
      },
      {
        severity: Number(latest.severity),
        title: String(latest.title),
        reproSteps: reproJoined,
        evidence: evidenceText,
        suspectedCommit:
          typeof latest.suspectedCommit === 'string' ? latest.suspectedCommit : null,
      },
      steps.map((s) => ({ narration: s.narration, status: s.status })),
    );
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'bugreport-refused');
    }
    return { sessionId, report: verdict.report };
  }

  async convertSessionForUser(userId: string, sessionId: string) {
    const row = await this.requireSession(userId, sessionId);
    const steps = await this.steps.find({
      where: { sessionId },
      order: { seq: 'ASC' },
    });
    const tasksRaw: unknown = row.goalTasks;
    const tasks = Array.isArray(tasksRaw) ? (tasksRaw as { id: string; text: string }[]) : [];
    const verdict = convertSession(
      { title: row.title, tasks },
      steps.map((s) => ({ seq: s.seq, action: s.action, target: s.target })),
    );
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'conversion-refused');
    }
    return { sessionId, testCase: verdict.testCase };
  }

  async listDeviceCatalog() {
    return { devices: deviceCatalog(), networks: networkCatalog() };
  }

  async createPersona(userId: string, dto: CreatePersonaDto) {
    const workspace = this.workspaceOf(dto);
    const name = typeof dto?.name === 'string' ? dto.name.trim().toLowerCase() : '';
    if (name.length === 0) {
      throw new BadRequestException('persona-name-missing');
    }
    const builtin = getPersona(name);
    if (builtin.ok) {
      throw new BadRequestException('persona-duplicate:' + name);
    }
    const existing = await this.personas.findOne({ where: { userId, workspace, name } });
    if (existing) {
      throw new BadRequestException('persona-duplicate:' + name);
    }
    const pace = dto?.paceMultiplier === undefined ? 1 : Number(dto.paceMultiplier);
    if (!Number.isFinite(pace) || pace < 0.25 || pace > 4) {
      throw new BadRequestException('persona-pace-invalid');
    }
    const traits = Array.isArray(dto?.traits)
      ? dto.traits.filter((t) => typeof t === 'string')
      : [];
    const checklist = Array.isArray(dto?.checklist)
      ? dto.checklist.filter((c) => typeof c === 'string')
      : [];
    return this.personas.save(
      this.personas.create({
        userId,
        workspace,
        name,
        traits,
        checklist,
        paceMultiplier: pace,
      }),
    );
  }

  async listCustomPersonas(userId: string, workspace?: string) {
    const w =
      typeof workspace === 'string' && workspace.trim().length > 0
        ? workspace.trim().slice(0, 64)
        : '';
    return w.length > 0
      ? this.personas.find({ where: { userId, workspace: w } })
      : this.personas.find({ where: { userId } });
  }

  async deletePersona(userId: string, dto: PersonaIdDto) {
    const row = await this.personas.findOne({ where: { id: dto?.personaId ?? '' } });
    if (!row || row.userId !== userId) {
      throw new BadRequestException('persona-not-found:' + String(dto?.personaId));
    }
    await this.personas.remove(row);
    return { deleted: true, id: row.id };
  }

  async listPersonaCatalog() {
    return { personas: listPersonas() };
  }
}
