import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestSession } from './entities/test-session.entity';
import { SessionStep } from './entities/session-step.entity';
import { SessionMessage } from './entities/session-message.entity';
import { SessionFinding } from './entities/session-finding.entity';
import { TestPersona } from './entities/test-persona.entity';
import { SessionParticipant } from './entities/session-participant.entity';
import { canHandBack, canTakeControl, isActing, transition } from './engine/session-lifecycle';
import { checkAction, isPlatform } from './engine/platform-capability';
import { evaluateStep, isEnvironment, resolveSafeMode } from './engine/safe-mode';
import { getPersona, listPersonas } from './engine/persona-profile';
import { narrate, parseGoal } from './engine/step-narration';
import { buildTimeline } from './engine/session-recording';
import { assembleBugReport } from './engine/bug-report';
import { convertSession } from './engine/test-conversion';
import { DEVICES, deviceCatalog, networkCatalog } from './engine/device-profile';
import { checkInterruption, interruptionCatalog } from './engine/interruption-scenario';
import { checkPermissionPlan, permissionCatalog } from './engine/permission-matrix';
import { checkCapability, checkInvitation, normalizeRole, roleCatalog } from './engine/session-collaboration';
import { checkHandoff } from './engine/cross-device-handoff';
import {
  ApplyPermissionPlanDto,
  CreatePersonaDto,
  CreateSessionDto,
  HandoffSessionDto,
  InviteParticipantDto,
  ParticipantRefDto,
  PersonaIdDto,
  PostMessageDto,
  RecordStepDto,
  ReportFindingDto,
  SessionRefDto,
  SimulateInterruptionDto,
} from './dto/live-testing.dto';

// Live agent testing service (FORGE TQ-001..025, TQ-030). Sessions run
// against the real app under engine law: every state change is a legal
// lifecycle transition, every step is evaluated by safe mode FIRST and the
// platform vocabulary second (security before mechanics), and every
// refusal is a named BadRequestException, never a silent guess. Multi-user
// sessions resolve capability through the collaboration engine: the owner
// can do everything, an active participant can do exactly what their role
// allows, and anyone else gets the same session-not-found wall as a
// stranger.

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
    @InjectRepository(SessionParticipant)
    private readonly participants: Repository<SessionParticipant>,
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

  private async requireSessionCapability(
    userId: string,
    sessionId: string,
    capability: string,
  ): Promise<TestSession> {
    const row = await this.sessions.findOne({ where: { id: sessionId } });
    if (!row) {
      throw new BadRequestException('session-not-found:' + sessionId);
    }
    if (row.userId === userId) {
      return row;
    }
    const participant = await this.participants.findOne({
      where: { sessionId, userId, state: 'active' },
    });
    if (!participant) {
      throw new BadRequestException('session-not-found:' + sessionId);
    }
    const verdict = checkCapability({ role: participant.role, capability });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'collaboration-refused');
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
    const row = await this.requireSessionCapability(userId, sessionId, 'steps');
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
    await this.requireSessionCapability(userId, sessionId, 'messages');
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
    await this.requireSessionCapability(userId, sessionId, 'findings');
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

  async listInterruptionCatalog(platform?: string) {
    return { scenarios: interruptionCatalog(platform) };
  }

  async simulateInterruption(userId: string, dto: SimulateInterruptionDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    const verdict = checkInterruption({
      platform: row.platform,
      scenario: dto?.scenario,
      status: row.status,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'interruption-refused');
    }
    const existing = await this.steps.find({ where: { sessionId } });
    const seq = existing.length + 1;
    const step = await this.steps.save(
      this.steps.create({
        sessionId,
        seq,
        actor: 'ai',
        action: 'interrupt',
        target: verdict.scenario ?? '',
        narration: 'Interrupting the session with ' + (verdict.name ?? ''),
        payload: {
          scenario: verdict.scenario,
          resume: verdict.resume,
          dataLossRisk: verdict.dataLossRisk,
          expectation: verdict.expectation,
        },
        occurredAt: new Date(),
      }),
    );
    let session = row;
    if (verdict.resume === 'manual') {
      const paused = transition(row.status, 'paused');
      if (paused.ok) {
        row.status = 'paused';
        session = await this.sessions.save(row);
      }
    }
    return {
      step,
      session,
      resume: verdict.resume,
      dataLossRisk: verdict.dataLossRisk,
      expectation: verdict.expectation,
    };
  }

  async listPermissionCatalog(platform?: string) {
    return { permissions: permissionCatalog(platform) };
  }

  async applyPermissionPlan(userId: string, dto: ApplyPermissionPlanDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSessionCapability(userId, sessionId, 'control');
    if (row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') {
      throw new BadRequestException('permission-session-terminal:' + row.status);
    }
    const verdict = checkPermissionPlan({ platform: row.platform, grants: dto?.grants });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'permission-refused');
    }
    const existing = await this.steps.find({ where: { sessionId } });
    const seq = existing.length + 1;
    const step = await this.steps.save(
      this.steps.create({
        sessionId,
        seq,
        actor: 'ai',
        action: 'permissions',
        target: null,
        narration: 'Applying permission plan with ' + (verdict.plan?.length ?? 0) + ' entries',
        payload: { grants: verdict.plan ?? [] },
        occurredAt: new Date(),
      }),
    );
    return { step, granted: verdict.granted, denied: verdict.denied, ask: verdict.ask };
  }

  async listRoleCatalog() {
    return { roles: roleCatalog() };
  }

  async inviteParticipant(userId: string, dto: InviteParticipantDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    if (row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') {
      throw new BadRequestException('collaboration-session-terminal:' + row.status);
    }
    const role = normalizeRole(dto?.role ?? 'tester');
    if (!role) {
      throw new BadRequestException('collaboration-role-unknown:' + String(dto?.role));
    }
    const invitee = typeof dto?.userId === 'string' ? dto.userId.trim() : '';
    if (invitee.length === 0) {
      throw new BadRequestException('collaboration-user-missing');
    }
    if (invitee === userId) {
      throw new BadRequestException('collaboration-self-invite');
    }
    const existing = await this.participants.findOne({
      where: { sessionId, userId: invitee },
    });
    if (existing) {
      throw new BadRequestException('collaboration-participant-duplicate:' + invitee);
    }
    return this.participants.save(
      this.participants.create({
        sessionId,
        userId: invitee,
        role,
        state: 'invited',
        invitedBy: userId,
      }),
    );
  }

  async acceptInvitation(userId: string, dto: ParticipantRefDto) {
    const row = await this.participants.findOne({ where: { id: dto?.participantId ?? '' } });
    if (!row || row.userId !== userId) {
      throw new BadRequestException('participant-not-found:' + String(dto?.participantId));
    }
    const verdict = checkInvitation({ state: row.state, action: 'accept' });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'collaboration-refused');
    }
    row.state = 'active';
    return this.participants.save(row);
  }

  async revokeParticipant(userId: string, dto: ParticipantRefDto) {
    const row = await this.participants.findOne({ where: { id: dto?.participantId ?? '' } });
    if (!row) {
      throw new BadRequestException('participant-not-found:' + String(dto?.participantId));
    }
    await this.requireSession(userId, row.sessionId);
    const verdict = checkInvitation({ state: row.state, action: 'revoke' });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason ?? 'collaboration-refused');
    }
    await this.participants.remove(row);
    return { deleted: true, id: row.id };
  }

  async listParticipants(userId: string, dto: SessionRefDto) {
    const sessionId = this.sessionIdOf(dto);
    await this.requireSession(userId, sessionId);
    const rows = await this.participants.find({ where: { sessionId } });
    return { sessionId, participants: rows };
  }

  async handoffSession(userId: string, dto: HandoffSessionDto) {
    const sessionId = this.sessionIdOf(dto);
    const row = await this.requireSession(userId, sessionId);
    const profileRaw: unknown = row.deviceProfile;
    const profile =
      profileRaw !== null && typeof profileRaw === 'object' && !Array.isArray(profileRaw)
        ? (profileRaw as Record<string, unknown>)
        : {};
    const fromDevice =
      typeof profile.device === 'string' && profile.device.trim().length > 0
        ? profile.device
        : null;
    const verdict = checkHandoff({
      status: row.status,
      fromDevice,
      toDevice: dto?.device,
      platform: row.platform,
    });
    if (!verdict.ok || !verdict.handoff) {
      throw new BadRequestException(verdict.reason ?? 'handoff-refused');
    }
    const spec = DEVICES.find((d) => d.device === verdict.handoff?.toDevice);
    if (!spec) {
      throw new BadRequestException('handoff-device-unknown:' + String(dto?.device));
    }
    row.deviceProfile = {
      device: spec.device,
      platform: spec.platform,
      lowEnd: spec.lowEnd,
      cpuThrottle: spec.cpuThrottle,
    };
    const session = await this.sessions.save(row);
    const existing = await this.steps.find({ where: { sessionId } });
    const seq = existing.length + 1;
    const step = await this.steps.save(
      this.steps.create({
        sessionId,
        seq,
        actor: 'ai',
        action: 'handoff',
        target: verdict.handoff.toDevice,
        narration: verdict.handoff.platformChanged
          ? 'Handing off to ' + verdict.handoff.toDevice + ' across platforms'
          : 'Handing off to ' + verdict.handoff.toDevice,
        payload: {
          fromDevice: verdict.handoff.fromDevice,
          platformChanged: verdict.handoff.platformChanged,
          resume: verdict.handoff.resume,
        },
        occurredAt: new Date(),
      }),
    );
    return { session, step, handoff: verdict.handoff };
  }
}
