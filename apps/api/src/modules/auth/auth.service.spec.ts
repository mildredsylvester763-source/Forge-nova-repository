// Auth security contract under test: refresh tokens are stored only as
// SHA-256 hashes, rotation is an atomic compare-and-set, reuse or a lost
// race kills the whole token family, and non-active accounts can never
// mint tokens. Repository/JWT/Config boundaries are mocked; every security
// decision asserted here is made by AuthService itself.

import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UserStatus } from './entities/user.entity';

function makeService(overrides: {
  refreshTokenFindOne?: (tokenHash: string) => Promise<any>;
  userFindOne?: (where: any) => Promise<any>;
  refreshUpdate?: (criteria: any, changes: any) => Promise<any>;
} = {}) {
  const savedTokens: any[] = [];
  const refreshFindOne = overrides.refreshTokenFindOne ?? (async () => null);
  const userFindOne = overrides.userFindOne ?? (async () => null);
  const refreshUpdate = overrides.refreshUpdate ?? (async () => ({ affected: 1 }));
  const userRepository = {
    findOne: jest.fn(userFindOne),
    save: jest.fn(async (x) => x),
    create: jest.fn((x) => x),
    increment: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<any>;
  const refreshTokenRepository = {
    findOne: jest.fn(refreshFindOne),
    save: jest.fn(async (x) => { savedTokens.push(x); return x; }),
    create: jest.fn((x) => x),
    update: jest.fn(refreshUpdate),
  } as unknown as Repository<any>;
  const jwtService = { sign: jest.fn(() => 'signed-access-token') } as unknown as JwtService;
  const configService = { getOrThrow: jest.fn(() => 'test-jwt-secret') } as unknown as ConfigService;
  const service = new AuthService(userRepository, refreshTokenRepository, jwtService, configService);
  return { service, userRepository, refreshTokenRepository, savedTokens, jwtService };
}

describe('AuthService', () => {
  describe('hashToken (refresh tokens are never stored raw)', () => {
    it('is deterministic SHA-256 — known vector', () => {
      const { service } = makeService();
      const hash = (service as any).hashToken('abc');
      expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('produces a different hash for every input', () => {
      const { service } = makeService();
      const a = (service as any).hashToken('token-one');
      const b = (service as any).hashToken('token-two');
      expect(a).not.toBe(b);
    });
  });

  describe('refresh rotation', () => {
    it('rejects an unknown refresh token without touching any family', async () => {
      const { service, refreshTokenRepository } = makeService();
      await expect(service.refresh('unknown-token', {})).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokenRepository.update).not.toHaveBeenCalled();
    });

    it('treats reuse of a consumed token as theft and revokes the family', async () => {
      const stored = {
        id: 'rt-1',
        userId: 'u1',
        familyId: 'fam-1',
        tokenHash: 'h',
        consumedAt: new Date('2026-10-06T12:00:00.000Z'),
        revokedAt: null,
        isExpired: false,
      };
      const { service, refreshTokenRepository } = makeService({
        refreshTokenFindOne: async () => stored,
      });
      await expect(service.refresh('stolen-token', {})).rejects.toThrow(/compromised/);
      const [criteria] = (refreshTokenRepository.update as jest.Mock).mock.calls[0];
      expect(criteria.familyId).toBe('fam-1');
      expect(criteria.revokedAt).toBeDefined(); // only un-revoked rows are touched
    });

    it('revokes the family when the token is expired', async () => {
      const stored = {
        id: 'rt-2', userId: 'u1', familyId: 'fam-2', tokenHash: 'h',
        consumedAt: null, revokedAt: null, isExpired: true,
      };
      const { service, refreshTokenRepository } = makeService({
        refreshTokenFindOne: async () => stored,
      });
      await expect(service.refresh('expired-token', {})).rejects.toThrow(/expired/);
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });

    it('refuses to mint tokens for a suspended account', async () => {
      const stored = {
        id: 'rt-3', userId: 'u-suspended', familyId: 'fam-3', tokenHash: 'h',
        consumedAt: null, revokedAt: null, isExpired: false,
      };
      const { service } = makeService({
        refreshTokenFindOne: async () => stored,
        userFindOne: async () => ({ id: 'u-suspended', role: 'owner', status: UserStatus.SUSPENDED }),
      });
      await expect(service.refresh('valid-but-suspended', {})).rejects.toThrow(/not active/);
    });

    it('treats a lost compare-and-set race as reuse and revokes the family', async () => {
      const stored = {
        id: 'rt-4', userId: 'u1', familyId: 'fam-4', tokenHash: 'h',
        consumedAt: null, revokedAt: null, isExpired: false,
      };
      let updateCalls = 0;
      const { service } = makeService({
        refreshTokenFindOne: async () => stored,
        userFindOne: async () => ({ id: 'u1', role: 'owner', status: UserStatus.ACTIVE }),
        refreshUpdate: async () => {
          updateCalls += 1;
          if (updateCalls === 1) return { affected: 0 }; // concurrent request won the CAS
          return { affected: 1 }; // the revokeFamily write
        },
      });
      await expect(service.refresh('raced-token', {})).rejects.toThrow(/compromised/);
      expect(updateCalls).toBe(2);
    });

    it('rotates successfully: new hashed token saved, raw token returned once', async () => {
      const stored = {
        id: 'rt-5', userId: 'u1', familyId: 'fam-5', tokenHash: 'h',
        consumedAt: null, revokedAt: null, isExpired: false,
      };
      const { service, savedTokens, jwtService } = makeService({
        refreshTokenFindOne: async () => stored,
        userFindOne: async () => ({ id: 'u1', role: 'owner', status: UserStatus.ACTIVE }),
      });
      const pair = await service.refresh('good-token', { ipAddress: '1.2.3.4' });
      expect(pair.accessToken).toBe('signed-access-token');
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
      expect(savedTokens).toHaveLength(1);
      expect(savedTokens[0].tokenHash).not.toBe('good-token');
      expect(savedTokens[0].tokenHash).toBe((service as any).hashToken(pair.refreshToken));
      expect(savedTokens[0].familyId).toBe('fam-5');
      expect(savedTokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    });
  });

  describe('logout', () => {
    it('revokes the family only when the token belongs to the caller', async () => {
      const { service, refreshTokenRepository } = makeService();
      const stored = {
        id: 'rt-6', userId: 'u1', familyId: 'fam-6',
        tokenHash: (service as any).hashToken('my-token'),
        consumedAt: null, revokedAt: null,
      };
      (refreshTokenRepository.findOne as jest.Mock).mockImplementation(async () => stored);
      await service.logout('u1', 'my-token');
      expect(refreshTokenRepository.update).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the token belongs to a different user', async () => {
      const stored = {
        id: 'rt-7', userId: 'attacker', familyId: 'fam-7', tokenHash: 'h',
      };
      const { service, refreshTokenRepository } = makeService({
        refreshTokenFindOne: async () => stored,
      });
      await service.logout('victim', 'not-my-token');
      expect(refreshTokenRepository.update).not.toHaveBeenCalled();
    });
  });
});
