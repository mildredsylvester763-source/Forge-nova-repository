import { assembleBugReport, SEVERITY_LABELS, StepSummary } from './bug-report';

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

describe('auto bug report assembly engine', () => {
  const sess = { platform: 'web', environment: 'staging', safeMode: true };

  it('pins the assembled report: label, repro lines, environment and dedupe key', () => {
    const v = assembleBugReport('sess-1', sess, {
      severity: 5,
      title: 'Cart total wrong',
      reproSteps: 'Total shows 0 after adding two items.',
      evidence: 'screenshot-9.png',
      suspectedCommit: 'a1b2c3d',
    }, [
      { narration: 'Clicking add to cart button', status: 'done' },
      { narration: 'Clicking add to cart button', status: 'done' },
      { narration: null, status: 'skipped' },
    ]);
    expect(v.ok).toBe(true);
    expect(v.report.severityLabel).toBe('blocker');
    expect(v.report.reproLines).toEqual([
      'Clicking add to cart button',
      'Clicking add to cart button',
      'Total shows 0 after adding two items.',
    ]);
    expect(v.report.environmentLine).toBe('platform web, environment staging, safe mode on');
    expect(v.report.dedupeKey).toBe('sess-1|5|cart total wrong');
    expect(v.report.suspectedCommit).toBe('a1b2c3d');
  });

  it('accepts a bare finding with no steps', () => {
    const v = assembleBugReport('sess-1', sess, { severity: 1, title: 'Typo on homepage', reproSteps: null, evidence: null, suspectedCommit: null }, []);
    expect(v.ok).toBe(true);
    expect(v.report.severityLabel).toBe('trivial');
    expect(v.report.reproLines).toHaveLength(0);
  });

  it('refuses out-of-range severities with the value in the reason', () => {
    let v = assembleBugReport('sess-1', sess, { severity: 6, title: 'X', reproSteps: null, evidence: null, suspectedCommit: null }, []);
    expect(v.reason).toBe('bugreport-severity-invalid:6');
    v = assembleBugReport('sess-1', sess, { severity: 0, title: 'X', reproSteps: null, evidence: null, suspectedCommit: null }, []);
    expect(v.reason).toBe('bugreport-severity-invalid:0');
  });

  it('refuses blank titles and non-hex suspected commits', () => {
    let v = assembleBugReport('sess-1', sess, { severity: 3, title: '   ', reproSteps: null, evidence: null, suspectedCommit: null }, []);
    expect(v.reason).toBe('bugreport-title-empty');
    v = assembleBugReport('sess-1', sess, { severity: 3, title: 'Crash', reproSteps: null, evidence: null, suspectedCommit: 'XYZ123' }, []);
    expect(v.reason).toBe('bugreport-suspected-commit-invalid');
  });

  it('normalizes titles so dedupe keys ignore case and spacing', () => {
    const a = assembleBugReport('s', sess, { severity: 3, title: 'Add   TO  Cart broken', reproSteps: null, evidence: null, suspectedCommit: null }, []);
    const b = assembleBugReport('s', sess, { severity: 3, title: 'add to cart broken', reproSteps: null, evidence: null, suspectedCommit: null }, []);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.report.dedupeKey).toBe(b.report.dedupeKey);
  });

  it('survives a 500-case sweep of severities, titles and step sets', () => {
    const rnd = mulberry32(42);
    const stepLabels = ['checkout page', 'cart icon', 'login form', 'menu bar', 'search field'];
    for (let i = 0; i < 500; i++) {
      const sev = Math.floor(rnd() * 8) - 1;
      const title = rnd() < 0.1 ? '' : 'Bug ' + Math.floor(rnd() * 1000) + ' on cart page';
      const nSteps = Math.floor(rnd() * 4);
      const steps: StepSummary[] = [];
      for (let s = 0; s < nSteps; s++) {
        steps.push({
          narration: rnd() < 0.8 ? 'Clicking ' + stepLabels[Math.floor(rnd() * stepLabels.length)] : null,
          status: 'done',
        });
      }
      const v = assembleBugReport('sw-' + i, sess, { severity: sev, title, reproSteps: null, evidence: null, suspectedCommit: null }, steps);
      if (sev >= 1 && sev <= 5 && title.length > 0) {
        expect(v.ok).toBe(true);
        expect(v.report.severityLabel).toBe(SEVERITY_LABELS[sev - 1]);
        expect(v.report.reproLines).toHaveLength(steps.filter((s) => s.narration !== null).length);
      } else if (sev < 1 || sev > 5) {
        expect(v.reason).toBe('bugreport-severity-invalid:' + sev);
      } else {
        expect(v.reason).toBe('bugreport-title-empty');
      }
    }
  });
});
