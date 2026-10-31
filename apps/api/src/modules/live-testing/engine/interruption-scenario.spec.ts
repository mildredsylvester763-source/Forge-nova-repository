import {
  INTERRUPTIONS,
  checkInterruption,
  interruptionCatalog,
} from './interruption-scenario';

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

describe('interruption scenario engine', () => {
  it('pins the catalog size and the per-platform support map', () => {
    expect(INTERRUPTIONS).toHaveLength(7);
    expect(interruptionCatalog()).toHaveLength(7);
    expect(interruptionCatalog('web')).toHaveLength(2);
    expect(interruptionCatalog('ios')).toHaveLength(7);
    expect(interruptionCatalog('desktop')).toHaveLength(4);
    expect(interruptionCatalog('android')).toHaveLength(7);
  });

  it('pins the incoming call scenario fields', () => {
    const v = checkInterruption({ platform: 'android', scenario: 'incoming-call', status: 'running' });
    expect(v.ok).toBe(true);
    expect(v.name).toBe('Incoming call');
    expect(v.resume).toBe('manual');
    expect(v.dataLossRisk).toBe(true);
    expect(v.expectation).toBe(
      'The app pauses mid-flow and restores full state when the call ends',
    );
  });

  it('normalizes case and padding in platform and scenario names', () => {
    const v = checkInterruption({
      platform: ' WEB ',
      scenario: ' Push-Notification ',
      status: 'running',
    });
    expect(v.ok).toBe(true);
    expect(v.scenario).toBe('push-notification');
    expect(v.resume).toBe('immediate');
    expect(v.dataLossRisk).toBe(false);
  });

  it('refuses unknown scenarios, unsupported platforms and non-running sessions by name', () => {
    let v = checkInterruption({ platform: 'web', scenario: 'earthquake', status: 'running' });
    expect(v.reason).toBe('interruption-unknown:earthquake');
    v = checkInterruption({ platform: 'web', scenario: 'incoming-call', status: 'running' });
    expect(v.reason).toBe('interruption-platform-unsupported:incoming-call:web');
    v = checkInterruption({ platform: 'web', scenario: 'push-notification', status: 'planned' });
    expect(v.reason).toBe('interruption-session-not-running:planned');
    v = checkInterruption({ platform: 'web', scenario: '', status: 'running' });
    expect(v.reason).toBe('interruption-scenario-missing');
    v = checkInterruption({ platform: '', scenario: 'push-notification', status: 'running' });
    expect(v.reason).toBe('interruption-platform-missing');
    v = checkInterruption({ platform: 'tv', scenario: 'push-notification', status: 'running' });
    expect(v.reason).toBe('interruption-platform-unknown:tv');
    v = checkInterruption({ platform: 'web', scenario: 'push-notification', status: '' });
    expect(v.reason).toBe('interruption-status-missing');
  });

  it('survives a 500-case sweep of platforms, scenarios and statuses', () => {
    const rnd = mulberry32(42);
    const platforms = ['web', 'android', 'ios', 'desktop', 'tv', '', ' tv '];
    const scenarios = INTERRUPTIONS.map((s) => s.scenario).concat([
      'earthquake',
      'spill',
      '',
      ' push-notification ',
    ]);
    const statuses = ['running', 'paused', 'planned', 'manual', 'completed', ''];
    for (let i = 0; i < 500; i++) {
      const platform = platforms[Math.floor(rnd() * platforms.length)];
      const scenario = scenarios[Math.floor(rnd() * scenarios.length)];
      const status = statuses[Math.floor(rnd() * statuses.length)];
      const v = checkInterruption({ platform, scenario, status });
      const p = platform.trim().toLowerCase();
      const s = scenario.trim().toLowerCase();
      if (p.length === 0) {
        expect(v.reason).toBe('interruption-platform-missing');
      } else if (!['web', 'android', 'ios', 'desktop'].includes(p)) {
        expect(v.reason).toBe('interruption-platform-unknown:' + p);
      } else if (s.length === 0) {
        expect(v.reason).toBe('interruption-scenario-missing');
      } else {
        const spec = INTERRUPTIONS.find((x) => x.scenario === s);
        if (!spec) {
          expect(v.reason).toBe('interruption-unknown:' + s);
        } else if (!spec.platforms.includes(p)) {
          expect(v.reason).toBe('interruption-platform-unsupported:' + s + ':' + p);
        } else if (status.length === 0) {
          expect(v.reason).toBe('interruption-status-missing');
        } else if (status !== 'running') {
          expect(v.reason).toBe('interruption-session-not-running:' + status);
        } else {
          expect(v.ok).toBe(true);
          expect(v.scenario).toBe(spec.scenario);
          expect(v.name).toBe(spec.name);
          expect(v.resume).toBe(spec.resume);
          expect(v.dataLossRisk).toBe(spec.dataLossRisk);
          expect(v.expectation).toBe(spec.expectation);
        }
      }
    }
  });
});
