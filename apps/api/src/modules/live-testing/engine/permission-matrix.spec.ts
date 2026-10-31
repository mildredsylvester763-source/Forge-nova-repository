import {
  PERMISSIONS,
  checkPermissionPlan,
  nextPermissionState,
  permissionCatalog,
} from './permission-matrix';

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

describe('permission matrix engine', () => {
  it('pins the platform vocabularies', () => {
    expect(PERMISSIONS).toHaveLength(4);
    const web = permissionCatalog('web')[0];
    expect(web?.permissions).toHaveLength(5);
    expect(web?.permissions).toContain('clipboard-read');
    const android = PERMISSIONS.find((p) => p.platform === 'android');
    expect(android?.permissions).toHaveLength(7);
    expect(android?.permissions).toContain('phone-state');
    const ios = PERMISSIONS.find((p) => p.platform === 'ios');
    expect(ios?.permissions).toContain('bluetooth');
    const desktop = PERMISSIONS.find((p) => p.platform === 'desktop');
    expect(desktop?.permissions).toContain('screen-recording');
    expect(permissionCatalog()).toHaveLength(4);
  });

  it('accepts a valid plan and counts the states', () => {
    const v = checkPermissionPlan({
      platform: 'web',
      grants: [
        { permission: 'camera', state: 'granted' },
        { permission: 'location', state: 'denied' },
        { permission: 'microphone', state: 'ask' },
      ],
    });
    expect(v.ok).toBe(true);
    expect(v.plan).toHaveLength(3);
    expect(v.granted).toBe(1);
    expect(v.denied).toBe(1);
    expect(v.ask).toBe(1);
  });

  it('normalizes case and padding in permission and state names', () => {
    const v = checkPermissionPlan({
      platform: 'web',
      grants: [{ permission: ' CAMERA ', state: ' GRANTED ' }],
    });
    expect(v.ok).toBe(true);
    expect(v.plan?.[0]?.permission).toBe('camera');
    expect(v.plan?.[0]?.state).toBe('granted');
  });

  it('refuses broken plans by name', () => {
    let v = checkPermissionPlan({ platform: 'tv', grants: [{ permission: 'camera', state: 'granted' }] });
    expect(v.reason).toBe('permission-platform-unknown:tv');
    v = checkPermissionPlan({ platform: 'web', grants: 'camera' });
    expect(v.reason).toBe('permission-plan-not-array');
    v = checkPermissionPlan({ platform: 'web', grants: [] });
    expect(v.reason).toBe('permission-plan-empty');
    v = checkPermissionPlan({ platform: 'web', grants: ['camera'] });
    expect(v.reason).toBe('permission-grant-not-object');
    v = checkPermissionPlan({ platform: 'web', grants: [{ state: 'granted' }] });
    expect(v.reason).toBe('permission-name-missing');
    v = checkPermissionPlan({
      platform: 'web',
      grants: [{ permission: 'storage', state: 'granted' }],
    });
    expect(v.reason).toBe('permission-unknown:storage:web');
    v = checkPermissionPlan({
      platform: 'web',
      grants: [{ permission: 'camera', state: 'always' }],
    });
    expect(v.reason).toBe('permission-state-invalid:always');
    v = checkPermissionPlan({
      platform: 'web',
      grants: [{ permission: 'camera', state: 'blocked' }],
    });
    expect(v.reason).toBe('permission-state-not-planable:blocked');
    v = checkPermissionPlan({
      platform: 'web',
      grants: [
        { permission: 'camera', state: 'granted' },
        { permission: 'camera', state: 'denied' },
      ],
    });
    expect(v.reason).toBe('permission-duplicate:camera');
    v = checkPermissionPlan({ grants: [{ permission: 'camera', state: 'granted' }] });
    expect(v.reason).toBe('permission-platform-missing');
    v = checkPermissionPlan({ platform: 'web', grants: [{ permission: 'camera' }] });
    expect(v.reason).toBe('permission-state-missing');
  });

  it('pins the runtime ask and deny flow', () => {
    let v = nextPermissionState({ current: 'ask', choice: 'grant' });
    expect(v.state).toBe('granted');
    expect(v.askable).toBe(false);
    v = nextPermissionState({ current: 'ask', choice: 'deny' });
    expect(v.state).toBe('denied');
    expect(v.askable).toBe(true);
    v = nextPermissionState({ current: 'denied', choice: 'deny' });
    expect(v.state).toBe('blocked');
    expect(v.askable).toBe(false);
    v = nextPermissionState({ current: 'denied', choice: 'grant' });
    expect(v.state).toBe('granted');
    v = nextPermissionState({ current: 'granted', choice: 'deny' });
    expect(v.state).toBe('denied');
    expect(v.askable).toBe(true);
    v = nextPermissionState({ current: 'granted', choice: 'grant' });
    expect(v.state).toBe('granted');
    expect(v.askable).toBe(false);
  });

  it('refuses blocked permissions and junk flow inputs by name', () => {
    let v = nextPermissionState({ current: 'blocked', choice: 'grant' });
    expect(v.reason).toBe('permission-blocked-no-prompt');
    v = nextPermissionState({ current: 'maybe', choice: 'grant' });
    expect(v.reason).toBe('permission-state-unknown:maybe');
    v = nextPermissionState({ current: 'ask', choice: 'maybe' });
    expect(v.reason).toBe('permission-choice-invalid:maybe');
  });

  it('survives a 500-case sweep of plans across platforms', () => {
    const rnd = mulberry32(42);
    const platforms = ['web', 'android', 'ios', 'desktop', 'tv', ''];
    const junkPerms = ['storage', 'nfc', 'blood-type', ''];
    const states = ['ask', 'granted', 'denied', 'blocked', 'always', ''];
    const knownPlatforms = ['web', 'android', 'ios', 'desktop'];
    for (let i = 0; i < 500; i++) {
      const platform = platforms[Math.floor(rnd() * platforms.length)];
      const entry = PERMISSIONS.find((p) => p.platform === platform);
      const grantCount = rnd() < 0.5 ? 1 : 2;
      const grants: { permission: unknown; state: unknown }[] = [];
      for (let g = 0; g < grantCount; g++) {
        const knownPool = entry ? entry.permissions : junkPerms;
        const pool = rnd() < 0.7 ? knownPool : junkPerms;
        grants.push({
          permission: pool[Math.floor(rnd() * pool.length)],
          state: states[Math.floor(rnd() * states.length)],
        });
      }
      const v = checkPermissionPlan({ platform, grants });
      const p = platform.trim().toLowerCase();
      if (p.length === 0) {
        expect(v.reason).toBe('permission-platform-missing');
        continue;
      }
      if (!knownPlatforms.includes(p)) {
        expect(v.reason).toBe('permission-platform-unknown:' + p);
        continue;
      }
      const vocab = (PERMISSIONS.find((x) => x.platform === p) as any).permissions as string[];
      const seen: string[] = [];
      let refused: string | null = null;
      for (const grant of grants) {
        const permission =
          typeof grant.permission === 'string' ? grant.permission.trim().toLowerCase() : '';
        const state = typeof grant.state === 'string' ? grant.state.trim().toLowerCase() : '';
        if (permission.length === 0) {
          refused = 'permission-name-missing';
        } else if (!vocab.includes(permission)) {
          refused = 'permission-unknown:' + permission + ':' + p;
        } else if (state.length === 0) {
          refused = 'permission-state-missing';
        } else if (!['ask', 'granted', 'denied', 'blocked'].includes(state)) {
          refused = 'permission-state-invalid:' + state;
        } else if (state === 'blocked') {
          refused = 'permission-state-not-planable:blocked';
        } else if (seen.includes(permission)) {
          refused = 'permission-duplicate:' + permission;
        } else {
          seen.push(permission);
        }
        if (refused) {
          break;
        }
      }
      if (refused) {
        expect(v.reason).toBe(refused);
      } else {
        expect(v.ok).toBe(true);
        expect(v.plan).toHaveLength(grants.length);
        expect(v.granted).toBe(grants.filter((g) => g.state === 'granted').length);
        expect(v.denied).toBe(grants.filter((g) => g.state === 'denied').length);
        expect(v.ask).toBe(grants.filter((g) => g.state === 'ask').length);
      }
    }
  });

  it('survives a 500-case sweep of states and choices', () => {
    const rnd = mulberry32(42);
    const states = ['ask', 'granted', 'denied', 'blocked', 'maybe', ''];
    const choices = ['grant', 'deny', 'maybe', ''];
    for (let i = 0; i < 500; i++) {
      const current = states[Math.floor(rnd() * states.length)];
      const choice = choices[Math.floor(rnd() * choices.length)];
      const v = nextPermissionState({ current, choice });
      const c = current.trim().toLowerCase();
      const ch = choice.trim().toLowerCase();
      if (!['ask', 'granted', 'denied', 'blocked'].includes(c)) {
        expect(v.reason).toBe('permission-state-unknown:' + current);
      } else if (c === 'blocked') {
        expect(v.reason).toBe('permission-blocked-no-prompt');
      } else if (ch !== 'grant' && ch !== 'deny') {
        expect(v.reason).toBe('permission-choice-invalid:' + choice);
      } else if (c === 'ask') {
        expect(v.state).toBe(ch === 'grant' ? 'granted' : 'denied');
        expect(v.askable).toBe(ch === 'grant' ? false : true);
      } else if (c === 'denied') {
        expect(v.state).toBe(ch === 'grant' ? 'granted' : 'blocked');
        expect(v.askable).toBe(false);
      } else {
        expect(v.state).toBe(ch === 'grant' ? 'granted' : 'denied');
        expect(v.askable).toBe(ch === 'grant' ? false : true);
      }
    }
  });
});
