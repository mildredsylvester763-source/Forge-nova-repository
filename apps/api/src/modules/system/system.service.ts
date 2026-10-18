// ============================================================================
// FILE: /apps/api/src/modules/system/system.service.ts
// ============================================================================
// The system plane. Health is DERIVED from a real database round-trip,
// never asserted. Counts come from real repositories and the real catalog
// — the inventory engine validates them before they are reported.

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EgressConnection } from '../egress-universal/entities/egress-connection.entity';
import { EgressCallLog } from '../egress-universal/entities/egress-call-log.entity';
import { listDestinations } from '../egress-universal/engine/destination-catalog';
import { buildStatusReport, buildInventoryReport } from './engine/system-inventory';

@Injectable()
export class SystemService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EgressConnection)
    private readonly connections: Repository<EgressConnection>,
    @InjectRepository(EgressCallLog)
    private readonly calls: Repository<EgressCallLog>,
  ) {}

  private version(): string {
    return process.env.npm_package_version || '1.0.0';
  }

  // One real round-trip to Postgres. No fake green.
  private async databaseUp(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async status(): Promise<Record<string, unknown>> {
    const dbUp = await this.databaseUp();
    const report = buildStatusReport(dbUp, this.version());
    if (!report.ok) throw new BadRequestException(report.reason);
    return {
      ...report.value,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  async inventory(): Promise<Record<string, unknown>> {
    const [connections, callLogs] = await Promise.all([
      this.connections.count(),
      this.calls.count(),
    ]);
    const destinations = listDestinations();
    const report = buildInventoryReport({
      connections,
      destinationsOffered: destinations.length,
      callLogs,
      oauthProviders: destinations.filter((d) => d.authStyle === 'oauth-code').length,
    });
    if (!report.ok) throw new BadRequestException(report.reason);
    return {
      ...report.value,
      generatedAt: new Date().toISOString(),
    };
  }
}
