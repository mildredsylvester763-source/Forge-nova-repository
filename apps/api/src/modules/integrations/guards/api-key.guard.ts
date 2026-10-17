// ============================================================================
// FILE: /apps/api/src/modules/integrations/guards/api-key.guard.ts
// ============================================================================

// Guards the MCP surface: the request must carry a well-formed
// fn_live_ key whose SHA-256 hash matches a non-revoked key row. On
// success the key owner's userId is attached as req.user — zero-trust
// holds: the MCP caller IS the user, with no body-supplied identity.

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Request } from 'express';
import { ApiKey } from '../entities/api-key.entity';
import { validateApiKeyFormat } from '../engine/api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const key = String(req.headers['x-api-key'] ?? '');
    const format = validateApiKeyFormat(key);
    if (!format.ok) {
      throw new UnauthorizedException(format.reason);
    }
    const keyHash = createHash('sha256').update(key).digest('hex');
    const row = await this.apiKeyRepository.findOne({ where: { keyHash } });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('apikey-invalid');
    }
    if (!row.scopes.includes('mcp')) {
      throw new UnauthorizedException('apikey-missing-scope:mcp');
    }
    row.lastUsedAt = new Date();
    await this.apiKeyRepository.save(row);
    req.user = { id: row.userId };
    return true;
  }
}
