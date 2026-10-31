import { DEVICES } from './device-profile';
import { checkHandoff } from './cross-device-handoff';

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

describe('cross-device handoff engine', () => {
  it('pins an initial assignment when the session has no device yet', () => {
    const v = checkHandoff({ status: 'running', fromDevice: null, toDevice: 'iphone-13', platform: 'web' });
    expect(v.ok).toBe(true);
    expect(v.handoff?.fromDevice).toBe(null);
    expect(v.handoff?.toDevice).toBe('iphone-13');
    expect(v.handoff?.toPlatform).toBe('ios');
    expect(v.handoff?.initial).toBe(true);
    expect(v.handoff?.platformChanged).toBe(true);
    expect(v.handoff?.resume).toBe('automatic');
    expect(v.handoff?.goalPreserved).toBe(true);
  });

  it('pins a same-platform handoff as automatic resume', () => {
    const v = checkHandoff({ status: 'running', fromDevice: 'pixel-5', toDevice: 'galaxy-s21' });
    expect(v.ok).toBe(true);
    expect(v.handoff?.initial).toBe(false);
    expect(v.handoff?.platformChanged).toBe(false);
    expect(v.handoff?.resume).toBe('automatic');
    expect(v.handoff?.fromDevice).toBe('pixel-5');
  });

  it('pins a cross-platform handoff as manual resume', () => {
    const v = checkHandoff({ status: 'paused', fromDevice: 'iphone-13', toDevice: 'windows-10' });
    expect(v.ok).toBe(true);
    expect(v.handoff?.platformChanged).toBe(true);
    expect(v.handoff?.resume).toBe('manual');
    expect(v.handoff?.toPlatform).toBe('desktop');
  });

  it('normalizes case and padding in device names', () => {
    const v = checkHandoff({
      status: 'running',
      fromDevice: ' IPHONE-13 ',
      toDevice: ' Galaxy-S21 ',
    });
    expect(v.ok).toBe(true);
    expect(v.handoff?.fromDevice).toBe('iphone-13');
    expect(v.handoff?.toDevice).toBe('galaxy-s21');
  });

  it('refuses illegal handoffs by name', () => {
    let v = checkHandoff({ status: 'planned', fromDevice: 'pixel-5', toDevice: 'iphone-13' });
    expect(v.reason).toBe('handoff-state-invalid:planned');
    v = checkHandoff({ status: 'completed', fromDevice: 'pixel-5', toDevice: 'iphone-13' });
    expect(v.reason).toBe('handoff-state-invalid:completed');
    v = checkHandoff({ status: 'running', fromDevice: 'pixel-5', toDevice: 'pixel-5' });
    expect(v.reason).toBe('handoff-same-device');
    v = checkHandoff({ status: 'running', fromDevice: 'pixel-5', toDevice: 'fridge-os' });
    expect(v.reason).toBe('handoff-device-unknown:fridge-os');
    v = checkHandoff({ status: 'running', fromDevice: 'watch-3', toDevice: 'iphone-13' });
    expect(v.reason).toBe('handoff-device-unknown:watch-3');
    v = checkHandoff({ status: 'running', fromDevice: 'pixel-5', toDevice: '' });
    expect(v.reason).toBe('handoff-to-missing');
    v = checkHandoff({ status: '', fromDevice: 'pixel-5', toDevice: 'iphone-13' });
    expect(v.reason).toBe('handoff-status-missing');
    v = checkHandoff({ status: 'running', toDevice: 'iphone-13' });
    expect(v.reason).toBe('handoff-platform-missing');
  });

  it('survives a 500-case sweep of statuses and device pairs', () => {
    const rnd = mulberry32(42);
    const statuses = ['running', 'paused', 'planned', 'manual', 'completed', ''];
    const deviceNames = DEVICES.map((d) => d.device).concat(['fridge-os', 'watch-3', '']);
    for (let i = 0; i < 500; i++) {
      const status = statuses[Math.floor(rnd() * statuses.length)];
      const useFrom = rnd() < 0.8;
      const fromRaw = deviceNames[Math.floor(rnd() * deviceNames.length)];
      const toRaw = deviceNames[Math.floor(rnd() * deviceNames.length)];
      const fromDevice = useFrom ? fromRaw : null;
      const platform = ['web', 'android', 'ios', 'desktop'][Math.floor(rnd() * 4)];
      const v = checkHandoff({ status, fromDevice, toDevice: toRaw, platform });
      const st = status.trim().toLowerCase();
      const toName = toRaw.trim().toLowerCase();
      const hasFrom = fromDevice !== null && String(fromDevice).trim().length > 0;
      const fromName = hasFrom ? String(fromDevice).trim().toLowerCase() : '';
      if (st.length === 0) {
        expect(v.reason).toBe('handoff-status-missing');
        continue;
      }
      if (st !== 'running' && st !== 'paused') {
        expect(v.reason).toBe('handoff-state-invalid:' + st);
        continue;
      }
      if (toName.length === 0) {
        expect(v.reason).toBe('handoff-to-missing');
        continue;
      }
      const to = DEVICES.find((d) => d.device === toName);
      if (!to) {
        expect(v.reason).toBe('handoff-device-unknown:' + toName);
        continue;
      }
      let from: { device: string; platform: string } | null = null;
      if (hasFrom) {
        const found = DEVICES.find((d) => d.device === fromName);
        if (!found) {
          expect(v.reason).toBe('handoff-device-unknown:' + fromName);
          continue;
        }
        if (found.device === to.device) {
          expect(v.reason).toBe('handoff-same-device');
          continue;
        }
        from = { device: found.device, platform: found.platform };
      }
      const platformChanged = hasFrom
        ? from !== null && from.platform !== to.platform
        : platform !== to.platform;
      expect(v.ok).toBe(true);
      expect(v.handoff?.fromDevice).toBe(hasFrom && from ? from.device : null);
      expect(v.handoff?.toDevice).toBe(to.device);
      expect(v.handoff?.toPlatform).toBe(to.platform);
      expect(v.handoff?.initial).toBe(!hasFrom);
      expect(v.handoff?.platformChanged).toBe(platformChanged);
      expect(v.handoff?.resume).toBe(
        !hasFrom ? 'automatic' : platformChanged ? 'manual' : 'automatic',
      );
      expect(v.handoff?.goalPreserved).toBe(true);
    }
  });
});
