import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { LiveTestingService } from './live-testing.service';
import {
  CreateSessionDto,
  PostMessageDto,
  RecordStepDto,
  ReportFindingDto,
  SessionRefDto,
} from './dto/live-testing.dto';

// Live agent testing controller (FORGE TQ-001..014, TQ-030). Every route is
// user-scoped through req.user.id: a session belongs to exactly one user,
// and cross-user access is a uniform not-found refusal, never a leak.

@Controller('live-testing')
export class LiveTestingController {
  constructor(private readonly liveTesting: LiveTestingService) {}

  @Post('sessions')
  async create(@Request() req: any, @Body() dto: CreateSessionDto) {
    return this.liveTesting.createSession(req.user.id, dto);
  }

  @Get('sessions')
  async list(@Request() req: any, @Query('limit') limit?: string) {
    return this.liveTesting.listSessions(req.user.id, limit);
  }

  @Get('sessions/detail')
  async detail(@Request() req: any, @Query('sessionId') sessionId?: string) {
    return this.liveTesting.getSession(req.user.id, sessionId ?? '');
  }

  @Get('personas')
  async personas() {
    return this.liveTesting.listPersonaCatalog();
  }

  @Post('sessions/start')
  async start(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.startSession(req.user.id, dto);
  }

  @Post('sessions/pause')
  async pause(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.pauseSession(req.user.id, dto);
  }

  @Post('sessions/resume')
  async resume(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.resumeSession(req.user.id, dto);
  }

  @Post('sessions/control')
  async control(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.takeControl(req.user.id, dto);
  }

  @Post('sessions/hand-back')
  async handBack(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.handBack(req.user.id, dto);
  }

  @Post('sessions/steps')
  async step(@Request() req: any, @Body() dto: RecordStepDto) {
    return this.liveTesting.recordStep(req.user.id, dto);
  }

  @Post('sessions/messages')
  async message(@Request() req: any, @Body() dto: PostMessageDto) {
    return this.liveTesting.postMessage(req.user.id, dto);
  }

  @Post('sessions/findings')
  async finding(@Request() req: any, @Body() dto: ReportFindingDto) {
    return this.liveTesting.reportFinding(req.user.id, dto);
  }

  @Post('sessions/complete')
  async complete(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.completeSession(req.user.id, dto);
  }

  @Post('sessions/fail')
  async fail(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.failSession(req.user.id, dto);
  }

  @Post('sessions/cancel')
  async cancel(@Request() req: any, @Body() dto: SessionRefDto) {
    return this.liveTesting.cancelSession(req.user.id, dto);
  }
}
