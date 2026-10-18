// ============================================================================
// FILE: /apps/api/src/modules/system/system.controller.ts
// ============================================================================

import { Controller, Get } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  // Deployment status: derived health (real DB round-trip), uptime, env.
  @Get('status')
  async status() {
    return this.system.status();
  }

  // The honest manifest: pinned modules + real counts from the database.
  @Get('inventory')
  async inventory() {
    return this.system.inventory();
  }
}
