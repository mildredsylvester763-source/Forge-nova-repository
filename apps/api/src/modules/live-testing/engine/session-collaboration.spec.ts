import {
  CAPABILITIES,
  ROLES,
  checkCapability,
  checkInvitation,
  normalizeRole,
  roleCatalog,
} from './session-collaboration';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('session collaboration engine', () => {
  it('pins the role catalog and the capability matrix', () => {
    expect(ROLES).toEqual(['owner', 'tester', 'observer']);
    expect(CAPABILITIES).toHaveLength(5);
    const catalog = roleCatalog();
    expect(catalog).toHaveLength(3);
    expect(catalog[0]?.role).toBe('owner');
    expect(catalog[0]?.capabilities).toEqual([
      'lifecycle',
      'steps',
      'messages',
      'findings',
      'control',
    ]);
    expect(catalog[1]?.capabilities).toEqual(['steps', 'messages', 'findings']);
    expect(catalog[2]?.capabilities).toEqual(['messages']);
  });

  it('allows and denies capabilities by role with named refusals', () => {
    let v = checkCapability({ role: 'owner', capability: 'lifecycle' });
    expect(v.ok).toBe(true);
    expect(v.allowed).toBe(true);
    v = checkCapability({ role: 'tester', capability: 'steps' });
    expect(v.ok).toBe(true);
    v = checkCapability({ role: 'observer', capability: 'messages' });
    expect(v.ok).toBe(true);
    v = checkCapability({ role: 'observer', capability: 'steps' });
    expect(v.ok).toBe(false);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('collaboration-capability-denied:observer:steps');
    v = checkCapability({ role: 'tester', capability: 'lifecycle' });
    expect(v.reason).toBe('collaboration-capability-denied:tester:lifecycle');
    v = checkCapability({ role: 'boss', capability: 'steps' });
    expect(v.reason).toBe('collaboration-role-unknown:boss');
    v = checkCapability({ role: 'owner', capability: 'launch' });
    expect(v.reason).toBe('collaboration-capability-unknown:launch');
  });

  it('normalizes case and padding in roles and capabilities', () => {
    expect(normalizeRole(' Tester ')).toBe('tester');
    expect(normalizeRole('OBSERVER')).toBe('observer');
    expect(normalizeRole('boss')).toBe(null);
    expect(normalizeRole(5)).toBe(null);
    const v = checkCapability({ role: ' TESTER ', capability: ' Steps ' });
    expect(v.ok).toBe(true);
    expect(v.allowed).toBe(true);
  });

  it('walks the invitation state machine and refuses illegal moves by name', () => {
    let v = checkInvitation({ state: 'invited', action: 'accept' });
    expect(v.ok).toBe(true);
    expect(v.state).toBe('active');
    v = checkInvitation({ state: 'invited', action: 'revoke' });
    expect(v.ok).toBe(true);
    expect(v.state).toBe('revoked');
    v = checkInvitation({ state: 'active', action: 'revoke' });
    expect(v.state).toBe('revoked');
    v = checkInvitation({ state: 'active', action: 'accept' });
    expect(v.reason).toBe('collaboration-state-invalid:active:accept');
    v = checkInvitation({ state: 'ghosted', action: 'accept' });
    expect(v.reason).toBe('collaboration-state-unknown:ghosted');
    v = checkInvitation({ state: 'invited', action: 'kick' });
    expect(v.reason).toBe('collaboration-action-unknown:kick');
    v = checkInvitation({ state: '', action: 'accept' });
    expect(v.reason).toBe('collaboration-state-unknown:');
    v = checkInvitation({ state: 'invited', action: '' });
    expect(v.reason).toBe('collaboration-action-unknown:');
  });

  it('survives a 500-case sweep of roles, capabilities, states and actions', () => {
    const rnd = mulberry32(42);
    const roles = ['owner', 'tester', 'observer', 'boss', ''];
    const capabilities = ['lifecycle', 'steps', 'messages', 'findings', 'control', 'launch', ''];
    const states = ['invited', 'active', 'ghosted', ''];
    const actions = ['accept', 'revoke', 'kick', ''];
    const matrix: Record<string, string[]> = {
      owner: ['lifecycle', 'steps', 'messages', 'findings', 'control'],
      tester: ['steps', 'messages', 'findings'],
      observer: ['messages'],
    };
    for (let i = 0; i < 500; i++) {
      const role = roles[Math.floor(rnd() * roles.length)];
      const capability = capabilities[Math.floor(rnd() * capabilities.length)];
      const v = checkCapability({ role, capability });
      const r = role.trim().toLowerCase();
      const c = capability.trim().toLowerCase();
      if (!['owner', 'tester', 'observer'].includes(r)) {
        expect(v.reason).toBe('collaboration-role-unknown:' + role);
      } else if (!capabilities.slice(0, 5).includes(c)) {
        expect(v.reason).toBe('collaboration-capability-unknown:' + capability);
      } else if (!(matrix[r] ?? []).includes(c)) {
        expect(v.ok).toBe(false);
        expect(v.allowed).toBe(false);
        expect(v.reason).toBe('collaboration-capability-denied:' + r + ':' + c);
      } else {
        expect(v.ok).toBe(true);
        expect(v.allowed).toBe(true);
      }

      const state = states[Math.floor(rnd() * states.length)];
      const action = actions[Math.floor(rnd() * actions.length)];
      const inv = checkInvitation({ state, action });
      const st = state.trim().toLowerCase();
      const ac = action.trim().toLowerCase();
      if (!['invited', 'active'].includes(st)) {
        expect(inv.reason).toBe('collaboration-state-unknown:' + state);
      } else if (!['accept', 'revoke'].includes(ac)) {
        expect(inv.reason).toBe('collaboration-action-unknown:' + action);
      } else if (ac === 'accept' && st === 'active') {
        expect(inv.reason).toBe('collaboration-state-invalid:active:accept');
      } else if (ac === 'accept') {
        expect(inv.ok).toBe(true);
        expect(inv.state).toBe('active');
      } else {
        expect(inv.ok).toBe(true);
        expect(inv.state).toBe('revoked');
      }
    }
  });
});
