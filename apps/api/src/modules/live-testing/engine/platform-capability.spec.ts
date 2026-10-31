import {
  PLATFORMS,
  allKnownActions,
  checkAction,
  isPlatform,
  listActions,
  supportsAction,
  validateDeviceProfile,
} from './platform-capability';

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

describe('platform capability engine (FORGE TQ-002..005/026)', () => {
  it('pins the per-platform action vocabulary', () => {
    expect(listActions('web')).toEqual([
      'click', 'type', 'scroll', 'drag', 'hover', 'key', 'upload', 'navigate', 'wait', 'assert',
    ]);
    expect(listActions('android')).toContain('back');
    expect(listActions('ios')).not.toContain('back');
    expect(listActions('ios')).toContain('stylus-pressure');
    expect(listActions('android')).not.toContain('stylus-pressure');
    expect(listActions('desktop')).toContain('file-dialog');
    expect(listActions('web')).not.toContain('swipe');
  });

  it('refuses unknown platforms, actions and unsupported pairs by name', () => {
    expect(checkAction('web', 'click')).toEqual({ ok: true });
    expect(checkAction('web', 'swipe')).toEqual({
      ok: false,
      reason: 'platform-action-unsupported:swipe:web',
    });
    expect(checkAction('android', 'back')).toEqual({ ok: true });
    expect(checkAction('ios', 'back')).toEqual({
      ok: false,
      reason: 'platform-action-unsupported:back:ios',
    });
    expect(checkAction('tv', 'click')).toEqual({
      ok: false,
      reason: 'platform-unknown:tv',
    });
    expect(checkAction('web', 'dance')).toEqual({
      ok: false,
      reason: 'platform-action-unknown:dance',
    });
    expect(checkAction('web', '')).toEqual({ ok: false, reason: 'platform-action-missing' });
    expect(checkAction('web', 'CLICK')).toEqual({
      ok: false,
      reason: 'platform-action-unknown:CLICK',
    });
  });

  it('validates device profiles with named refusals', () => {
    expect(validateDeviceProfile(null)).toEqual({
      ok: false,
      reason: 'device-profile-not-an-object',
    });
    expect(validateDeviceProfile({ deviceClass: 'standard' })).toEqual({
      ok: false,
      reason: 'device-profile-missing-platform',
    });
    expect(validateDeviceProfile({ platform: 'web', deviceClass: 'tiny' })).toEqual({
      ok: false,
      reason: 'device-class-invalid:tiny',
    });
    expect(validateDeviceProfile({ platform: 'web', network: '5g' })).toEqual({
      ok: false,
      reason: 'device-network-invalid:5g',
    });
    expect(validateDeviceProfile({ platform: 'web', screenWidth: -5 })).toEqual({
      ok: false,
      reason: 'device-screen-invalid-width:-5',
    });
    const ok = validateDeviceProfile({
      platform: 'android',
      deviceClass: 'low-end',
      network: '3g',
      screenWidth: 360,
      screenHeight: 640,
    });
    expect(ok.ok).toBe(true);
    expect(ok.profile).toEqual({
      platform: 'android',
      deviceClass: 'low-end',
      network: '3g',
      screenWidth: 360,
      screenHeight: 640,
    });
  });

  it('defaults the untouched profile fields honestly', () => {
    const v = validateDeviceProfile({ platform: 'ios' });
    expect(v.ok).toBe(true);
    expect(v.profile?.deviceClass).toBe('standard');
    expect(v.profile?.network).toBe('wifi');
    expect(v.profile?.screenWidth).toBeNull();
    expect(v.profile?.screenHeight).toBeNull();
  });

  it('500-case sweep: verdicts match the vocabulary exactly', () => {
    const rand = mulberry32(42);
    const pool = allKnownActions().concat(['dance', 'flap', 'CLICK']);
    const plats: string[] = [...PLATFORMS, 'tv', '', 'web '];
    for (let i = 0; i < 500; i++) {
      const platform = plats[Math.floor(rand() * plats.length)];
      const action = pool[Math.floor(rand() * pool.length)];
      const v = checkAction(platform, action);
      const legal =
        isPlatform(platform) &&
        typeof action === 'string' &&
        allKnownActions().includes(action) &&
        supportsAction(platform, action);
      expect(v.ok).toBe(legal);
      if (action === 'stylus-pressure' && v.ok) {
        expect(platform).toBe('ios');
      }
      if (!v.ok && isPlatform(platform)) {
        expect(v.reason).toContain('platform-action-');
      }
    }
  });
});
