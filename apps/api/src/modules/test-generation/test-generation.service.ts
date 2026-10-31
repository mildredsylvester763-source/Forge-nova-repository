import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeneratedSuite } from './entities/generated-suite.entity';
import { planUnitTests, UNIT_KINDS, UNIT_PARAM_TYPES } from './engine/unit-test-generation';
import { planIntegrationTests } from './engine/integration-graph';
import { planE2eSuite, E2E_ACTIONS } from './engine/e2e-session-replay';
import { planPropertySuite } from './engine/property-based';
import { runFuzzCampaign, FUZZ_KINDS, FUZZ_FIELD_TYPES } from './engine/fuzz-testing';
import {
  E2eSessionDto,
  FuzzCampaignDto,
  IntegrationGraphDto,
  PropertySuiteDto,
  UnitTestGenDto,
} from './dto/test-generation.dto';

// Test generation service (FORGE TQ-031..035). Unit suites from boundary
// analysis, integration suites from the service graph, e2e suites from
// recorded sessions, property suites with seeded repro commands, and
// budgeted fuzz campaigns. All planning lives in the pure engines; this
// service owns persistence, per-user isolation and named refusals. Every
// generated suite is stored with its seed and an FNV-1a checksum over the
// case names so two runs of the same request always match.

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

@Injectable()
export class TestGenerationService {
  constructor(
    @InjectRepository(GeneratedSuite)
    private readonly suites: Repository<GeneratedSuite>,
  ) {}

  listUnitKinds() {
    return [...UNIT_KINDS];
  }

  listUnitParamTypes() {
    return [...UNIT_PARAM_TYPES];
  }

  listE2eActions() {
    return [...E2E_ACTIONS];
  }

  listFuzzKinds() {
    return [...FUZZ_KINDS];
  }

  listFuzzFieldTypes() {
    return [...FUZZ_FIELD_TYPES];
  }

  async generateUnitTests(userId: string, dto: UnitTestGenDto) {
    const verdict = planUnitTests(dto as { target?: unknown; behaviors?: unknown });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const cases = (verdict.cases ?? []) as unknown as GeneratedSuite['cases'];
    const checksum = fnv1a((verdict.cases ?? []).map((c) => c.name).join('|'));
    const row = await this.suites.save(
      this.suites.create({
        userId,
        kind: 'unit',
        target: verdict.target ?? '',
        seed: 42,
        checksum,
        cases,
      }),
    );
    return { id: row.id, kind: row.kind, target: row.target, checksum: row.checksum, cases: row.cases, count: cases.length };
  }

  async generateIntegrationTests(userId: string, dto: IntegrationGraphDto) {
    const verdict = planIntegrationTests(dto as { services?: unknown; dependencies?: unknown });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const names = (dto?.services ?? [])
      .map((s) => (typeof s === 'string' ? s : s?.name))
      .filter((n): n is string => typeof n === 'string');
    const target = names.join('+').slice(0, 200);
    const cases = (verdict.cases ?? []) as unknown as GeneratedSuite['cases'];
    const checksum = fnv1a((verdict.cases ?? []).map((c) => c.name).join('|'));
    const row = await this.suites.save(
      this.suites.create({
        userId,
        kind: 'integration',
        target,
        seed: 42,
        checksum,
        cases,
      }),
    );
    return { id: row.id, kind: row.kind, target: row.target, checksum: row.checksum, cases: row.cases, count: cases.length };
  }

  async generateE2eSuite(userId: string, dto: E2eSessionDto) {
    const verdict = planE2eSuite(dto as { session?: unknown; steps?: unknown });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const cases = (verdict.steps ?? []) as unknown as GeneratedSuite['cases'];
    const checksum = fnv1a((verdict.steps ?? []).map((s) => s.action + ':' + s.target).join('|'));
    const row = await this.suites.save(
      this.suites.create({
        userId,
        kind: 'e2e',
        target: verdict.session ?? '',
        seed: 42,
        checksum,
        cases,
      }),
    );
    return { id: row.id, kind: row.kind, target: row.target, checksum: row.checksum, cases: row.cases, count: cases.length };
  }

  async planPropertySuite(userId: string, dto: PropertySuiteDto) {
    const verdict = planPropertySuite(dto as { name?: unknown; runs?: unknown; seed?: unknown });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const cases = [{ repro: verdict.repro ?? '' }] as unknown as GeneratedSuite['cases'];
    const checksum = fnv1a(verdict.repro ?? '');
    const row = await this.suites.save(
      this.suites.create({
        userId,
        kind: 'property',
        target: verdict.name ?? '',
        seed: verdict.seed ?? 42,
        checksum,
        cases,
      }),
    );
    return { id: row.id, kind: row.kind, target: row.target, checksum: row.checksum, cases: row.cases, count: cases.length };
  }

  async runFuzzCampaign(userId: string, dto: FuzzCampaignDto) {
    const verdict = runFuzzCampaign(dto as {
      kind?: unknown;
      fields?: unknown;
      samples?: unknown;
      budget?: unknown;
      seed?: unknown;
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const cases = (verdict.cases ?? []) as unknown as GeneratedSuite['cases'];
    const checksum = fnv1a(
      (verdict.cases ?? [])
        .map((c) => (c.mutation !== undefined ? c.mutation : Object.keys(c.input).sort().join(',')))
        .join('|'),
    );
    const row = await this.suites.save(
      this.suites.create({
        userId,
        kind: 'fuzz',
        target: verdict.kind ?? '',
        seed: verdict.seed ?? 42,
        checksum,
        cases,
      }),
    );
    return { id: row.id, kind: row.kind, target: row.target, checksum: row.checksum, cases: row.cases, count: cases.length };
  }

  async listSuites(userId: string) {
    return this.suites.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async getSuite(userId: string, id: string) {
    const row = await this.suites.findOne({ where: { userId, id } });
    if (!row) {
      throw new BadRequestException('suite-not-found:' + id);
    }
    return row;
  }
}
