import { GESTURE_MECHANICS, checkGesture, gestureCatalog } from './gesture-mechanics';

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

describe('gesture mechanics engine', () => {
  it('pins the catalog size and the per-platform support map', () => {
    expect(GESTURE_MECHANICS).toHaveLength(7);
    expect(gestureCatalog()).toHaveLength(7);
    expect(gestureCatalog('web')).toHaveLength(0);
    expect(gestureCatalog('android')).toHaveLength(6);
    expect(gestureCatalog('ios')).toHaveLength(7);
    expect(gestureCatalog('desktop')).toHaveLength(0);
    expect(gestureCatalog('tv')).toHaveLength(0);
  });

  it('pins the stylus pressure gesture on ios', () => {
    const v = checkGesture({ platform: ' ios ', gesture: ' Stylus-Pressure ', pressure: 0.75 });
    expect(v.ok).toBe(true);
    expect(v.gesture).toBe('stylus-pressure');
    expect(v.pressure).toBe(0.75);
    expect(v.text).toBe('Drawing with stylus at 0.75 pressure');
  });

  it('normalizes direction, duration and contacts on legal gestures', () => {
    let v = checkGesture({ platform: 'android', gesture: 'swipe', direction: 'LEFT' });
    expect(v.ok).toBe(true);
    expect(v.direction).toBe('left');
    expect(v.text).toBe('Swiping left with 1 finger');
    v = checkGesture({ platform: 'ios', gesture: 'long-press', durationMs: 1200 });
    expect(v.durationMs).toBe(1200);
    expect(v.text).toBe('Long pressing for 1200ms');
    v = checkGesture({ platform: 'ios', gesture: 'long-press' });
    expect(v.durationMs).toBe(500);
    expect(v.text).toBe('Long pressing for 500ms');
    v = checkGesture({ platform: 'android', gesture: 'multi-touch', contacts: 4 });
    expect(v.contacts).toBe(4);
    expect(v.text).toBe('Touching with 4 fingers');
    v = checkGesture({ platform: 'android', gesture: 'pinch' });
    expect(v.contacts).toBe(2);
    expect(v.text).toBe('Pinching with 2 fingers');
    v = checkGesture({ platform: 'android', gesture: 'rotate' });
    expect(v.text).toBe('Rotating with 2 fingers');
  });

  it('refuses unsupported platforms, bad contacts, bad pressure and bad direction by name', () => {
    let v = checkGesture({ platform: 'web', gesture: 'pinch' });
    expect(v.reason).toBe('gesture-platform-unsupported:pinch:web');
    v = checkGesture({ platform: 'android', gesture: 'stylus-pressure', pressure: 0.5 });
    expect(v.reason).toBe('gesture-platform-unsupported:stylus-pressure:android');
    v = checkGesture({ platform: 'android', gesture: 'moonwalk' });
    expect(v.reason).toBe('gesture-unknown:moonwalk');
    v = checkGesture({ platform: 'tv', gesture: 'pinch' });
    expect(v.reason).toBe('gesture-platform-unknown:tv');
    v = checkGesture({ platform: '', gesture: 'pinch' });
    expect(v.reason).toBe('gesture-platform-missing');
    v = checkGesture({ platform: 'ios', gesture: '' });
    expect(v.reason).toBe('gesture-missing');
    v = checkGesture({ platform: 'android', gesture: 'pinch', contacts: 3 });
    expect(v.reason).toBe('gesture-contacts-invalid:3');
    v = checkGesture({ platform: 'android', gesture: 'multi-touch', contacts: 1 });
    expect(v.reason).toBe('gesture-contacts-invalid:1');
    v = checkGesture({ platform: 'android', gesture: 'multi-touch', contacts: 1.5 });
    expect(v.reason).toBe('gesture-contacts-invalid:1.5');
    v = checkGesture({ platform: 'android', gesture: 'swipe' });
    expect(v.reason).toBe('gesture-direction-missing');
    v = checkGesture({ platform: 'android', gesture: 'swipe', direction: 'diagonal' });
    expect(v.reason).toBe('gesture-direction-invalid:diagonal');
    v = checkGesture({ platform: 'ios', gesture: 'tap', direction: 'up' });
    expect(v.reason).toBe('gesture-direction-unexpected');
    v = checkGesture({ platform: 'ios', gesture: 'stylus-pressure' });
    expect(v.reason).toBe('gesture-pressure-missing');
    v = checkGesture({ platform: 'ios', gesture: 'stylus-pressure', pressure: 0 });
    expect(v.reason).toBe('gesture-pressure-invalid:0');
    v = checkGesture({ platform: 'ios', gesture: 'stylus-pressure', pressure: 1.5 });
    expect(v.reason).toBe('gesture-pressure-invalid:1.5');
    v = checkGesture({ platform: 'android', gesture: 'pinch', pressure: 0.5 });
    expect(v.reason).toBe('gesture-pressure-unexpected');
    v = checkGesture({ platform: 'ios', gesture: 'long-press', durationMs: 50 });
    expect(v.reason).toBe('gesture-duration-invalid:50');
    v = checkGesture({ platform: 'ios', gesture: 'tap', durationMs: 500 });
    expect(v.reason).toBe('gesture-duration-unexpected');
  });

  it('survives a 500-case sweep of platforms, gestures and parameters', () => {
    const rnd = mulberry32(42);
    const platforms = ['web', 'android', 'ios', 'desktop', 'tv', '', ' ios'];
    const gestures = GESTURE_MECHANICS.map((x) => x.gesture).concat([
      'moonwalk',
      '',
      'Pinch',
    ]);
    const contactsPool: unknown[] = [undefined, 1, 2, 3, 5, 6, 0, 1.5];
    const dirPool: unknown[] = [undefined, 'up', 'down', 'left', 'right', 'diagonal', ''];
    const presPool: unknown[] = [undefined, 0, 0.25, 0.5, 1, 1.5, -0.1];
    const durPool: unknown[] = [undefined, 100, 500, 10000, 10001, 50];
    const directions = ['up', 'down', 'left', 'right'];
    const platformList = ['web', 'android', 'ios', 'desktop'];
    for (let i = 0; i < 500; i++) {
      const platform = platforms[Math.floor(rnd() * platforms.length)];
      const gesture = gestures[Math.floor(rnd() * gestures.length)];
      const contacts = contactsPool[Math.floor(rnd() * contactsPool.length)];
      const direction = dirPool[Math.floor(rnd() * dirPool.length)];
      const pressure = presPool[Math.floor(rnd() * presPool.length)];
      const durationMs = durPool[Math.floor(rnd() * durPool.length)];
      const r = checkGesture({ platform, gesture, contacts, direction, pressure, durationMs });
      const norm = (x: unknown): string =>
        typeof x === 'string' ? x.trim().toLowerCase() : '';
      const p = norm(platform);
      const g = norm(gesture);
      let want: string | null = null;
      let wantOk = false;
      if (p.length === 0) {
        want = 'gesture-platform-missing';
      } else if (!platformList.includes(p)) {
        want = 'gesture-platform-unknown:' + p;
      } else if (g.length === 0) {
        want = 'gesture-missing';
      } else {
        const spec = GESTURE_MECHANICS.find((x) => x.gesture === g);
        if (!spec) {
          want = 'gesture-unknown:' + g;
        } else if (!spec.platforms.includes(p as 'web')) {
          want = 'gesture-platform-unsupported:' + g + ':' + p;
        } else {
          const c =
            contacts === undefined || contacts === null ? spec.minContacts : Number(contacts);
          if (!(Number.isInteger(c) && c >= spec.minContacts && c <= spec.maxContacts)) {
            want = 'gesture-contacts-invalid:' + String(contacts);
          } else {
            let stage: string | null = null;
            if (spec.requiresDirection) {
              const d = norm(direction);
              if (d.length === 0) {
                stage = 'gesture-direction-missing';
              } else if (!directions.includes(d)) {
                stage = 'gesture-direction-invalid:' + d;
              }
            } else if (norm(direction).length > 0) {
              stage = 'gesture-direction-unexpected';
            }
            if (stage === null) {
              if (spec.requiresPressure) {
                if (pressure === undefined || pressure === null) {
                  stage = 'gesture-pressure-missing';
                } else {
                  const pr = Number(pressure);
                  if (!Number.isFinite(pr) || pr <= 0 || pr > 1) {
                    stage = 'gesture-pressure-invalid:' + String(pressure);
                  }
                }
              } else if (pressure !== undefined && pressure !== null) {
                stage = 'gesture-pressure-unexpected';
              }
            }
            if (stage === null) {
              if (spec.allowsDuration) {
                if (durationMs !== undefined && durationMs !== null) {
                  const d = Number(durationMs);
                  if (!Number.isInteger(d) || d < 100 || d > 10000) {
                    stage = 'gesture-duration-invalid:' + String(durationMs);
                  }
                }
              } else if (durationMs !== undefined && durationMs !== null) {
                stage = 'gesture-duration-unexpected';
              }
            }
            if (stage === null) {
              wantOk = true;
            } else {
              want = stage;
            }
          }
        }
      }
      if (wantOk) {
        expect(r.ok).toBe(true);
      } else {
        expect(r.ok).toBe(false);
        expect(r.reason).toBe(want);
      }
    }
  });
});
