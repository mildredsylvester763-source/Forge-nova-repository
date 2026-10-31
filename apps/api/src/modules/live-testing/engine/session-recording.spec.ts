import { buildTimeline, TimelineStepInput, TimelineMarkerInput } from './session-recording';

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

describe('session recording timeline engine', () => {
  const T0 = new Date('2026-10-31T10:00:00.000Z').getTime();

  it('pins the interleaved timeline order, ids, offsets and duration', () => {
    const v = buildTimeline(new Date(T0), [
      { seq: 1, narration: 'Clicking add to cart button', status: 'done', occurredAt: new Date(T0 + 1000) },
      { seq: 2, narration: 'Typing 14 characters into search box', status: 'done', occurredAt: new Date(T0 + 2500) },
    ], [{ label: 'paused', occurredAt: new Date(T0 + 2000) }]);
    expect(v.ok).toBe(true);
    expect(v.events.map((e) => e.kind).join(',')).toBe('step,marker,step');
    expect(v.events.map((e) => e.offsetMs).join(',')).toBe('1000,2000,2500');
    expect(v.events.map((e) => e.id).join(',')).toBe('event-1,event-2,event-3');
    expect(v.durationMs).toBe(2500);
  });

  it('refuses a session that never started', () => {
    const v = buildTimeline(null, [], []);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('recording-not-started');
  });

  it('accepts an empty timeline with zero duration', () => {
    const v = buildTimeline(new Date(T0), [], []);
    expect(v.ok).toBe(true);
    expect(v.events).toHaveLength(0);
    expect(v.durationMs).toBe(0);
  });

  it('refuses broken sequences and pre-start steps with named reasons', () => {
    let v = buildTimeline(new Date(T0), [{ seq: 2, narration: null, status: 'done', occurredAt: new Date(T0 + 100) }], []);
    expect(v.reason).toBe('recording-step-seq-broken:2');
    v = buildTimeline(new Date(T0), [{ seq: 1, narration: null, status: 'done', occurredAt: new Date(T0 - 50) }], []);
    expect(v.reason).toBe('recording-step-before-start:1');
    v = buildTimeline(new Date(T0), [], [{ label: '   ', occurredAt: new Date(T0 + 10) }]);
    expect(v.reason).toBe('recording-marker-label-empty');
  });

  it('breaks step-vs-marker ties in favor of the step', () => {
    const v = buildTimeline(
      new Date(T0),
      [{ seq: 1, narration: null, status: 'done', occurredAt: new Date(T0 + 500) }],
      [{ label: 'paused', occurredAt: new Date(T0 + 500) }],
    );
    expect(v.ok).toBe(true);
    expect(v.events[0].kind).toBe('step');
    expect(v.events[1].kind).toBe('marker');
  });

  it('survives a 500-case sweep of mixed steps and markers', () => {
    const rnd = mulberry32(42);
    const stepLabels = ['checkout page', 'cart icon', 'login form', 'menu bar', 'search field'];
    const markerPool = ['paused', 'resumed', 'manual control', 'handed back'];
    for (let i = 0; i < 500; i++) {
      const nSteps = Math.floor(rnd() * 5);
      const nMarkers = Math.floor(rnd() * 3);
      const mutate = rnd();
      const steps: TimelineStepInput[] = [];
      for (let s = 0; s < nSteps; s++) {
        steps.push({
          seq: s + 1,
          narration: rnd() < 0.5 ? 'Clicking ' + stepLabels[Math.floor(rnd() * stepLabels.length)] : null,
          status: 'done',
          occurredAt: new Date(T0 + Math.floor(rnd() * 10000)),
        });
      }
      const markers: TimelineMarkerInput[] = [];
      for (let s = 0; s < nMarkers; s++) {
        markers.push({
          label: markerPool[Math.floor(rnd() * markerPool.length)],
          occurredAt: new Date(T0 + Math.floor(rnd() * 10000)),
        });
      }
      if (mutate < 0.12 && steps.length > 0) {
        steps[Math.floor(rnd() * steps.length)].seq = 99;
      } else if (mutate < 0.2 && steps.length > 0) {
        steps[Math.floor(rnd() * steps.length)].occurredAt = new Date(T0 - 1 - Math.floor(rnd() * 100));
      }
      const v = buildTimeline(new Date(T0), steps, markers);
      if (v.ok) {
        for (let e = 1; e < v.events.length; e++) {
          expect(v.events[e - 1].offsetMs).toBeLessThanOrEqual(v.events[e].offsetMs);
        }
        v.events.forEach((e, idx) => expect(e.id).toBe('event-' + (idx + 1)));
        const last = v.events.length === 0 ? 0 : v.events[v.events.length - 1].offsetMs;
        expect(v.durationMs).toBe(last);
      } else {
        expect(v.reason).toMatch(/^recording-/);
      }
    }
  });
});
