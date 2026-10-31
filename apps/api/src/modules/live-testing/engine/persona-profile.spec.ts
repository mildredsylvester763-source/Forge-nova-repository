import {
  PersonaProfile,
  deriveChecklist,
  getPersona,
  listPersonas,
  paceMultiplier,
} from './persona-profile';

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

describe('persona engine (FORGE TQ-014)', () => {
  it('lists the six archetypes in a stable order', () => {
    expect(listPersonas()).toEqual([
      'impatient-user',
      'low-vision-user',
      'motor-impaired-user',
      'new-user',
      'power-user',
      'screen-reader-user',
    ]);
  });

  it('resolves personas case-insensitively and refuses unknowns by name', () => {
    const v = getPersona('new-user');
    expect(v.ok).toBe(true);
    expect(v.profile?.familiarity).toBe(10);
    expect(getPersona('New-User ').ok).toBe(true);
    expect(getPersona('robot')).toEqual({ ok: false, reason: 'persona-unknown:robot' });
    expect(getPersona('')).toEqual({ ok: false, reason: 'persona-missing' });
    expect(getPersona(undefined)).toEqual({ ok: false, reason: 'persona-missing' });
  });

  it('hands out fresh copies: the catalog can never be mutated', () => {
    const a = getPersona('new-user');
    if (!a.ok || !a.profile) throw new Error('expected ok');
    a.profile.name = 'mutated';
    a.profile.patience = 1;
    const b = getPersona('new-user');
    expect(b.ok && b.profile?.name).toBe('new-user');
    expect(b.ok && b.profile?.patience).toBe(80);
  });

  it('derives the checklist from the traits deterministically', () => {
    const sr = getPersona('screen-reader-user');
    if (!sr.ok || !sr.profile) throw new Error('expected ok');
    const srChecks = deriveChecklist(sr.profile);
    expect(srChecks[0]).toBe('smoke-critical-path');
    expect(srChecks).toContain('keyboard-navigation');
    expect(srChecks).toContain('focus-order');
    expect(srChecks).toContain('screen-reader-labels');
    expect(srChecks).toContain('contrast-checks');
    expect(srChecks).toContain('keyboard-only-trap-scan');

    const imp = getPersona('impatient-user');
    if (!imp.ok || !imp.profile) throw new Error('expected ok');
    const impChecks = deriveChecklist(imp.profile);
    expect(impChecks).toContain('loading-feedback');
    expect(impChecks).not.toContain('keyboard-navigation');

    const nu = getPersona('new-user');
    if (!nu.ok || !nu.profile) throw new Error('expected ok');
    const nuChecks = deriveChecklist(nu.profile);
    expect(nuChecks).toContain('onboarding-flow');
    expect(nuChecks).toContain('empty-states');
    expect(nuChecks).toContain('help-affordances');
    expect(nuChecks).toContain('edge-case-inputs');
  });

  it('paces from patience in three pinned bands', () => {
    const p = (name: string): PersonaProfile => {
      const v = getPersona(name);
      if (!v.ok || !v.profile) throw new Error('expected ok for ' + name);
      return v.profile;
    };
    expect(paceMultiplier(p('new-user'))).toBe(1.5);
    expect(paceMultiplier(p('screen-reader-user'))).toBe(1.5);
    expect(paceMultiplier(p('power-user'))).toBe(1.0);
    expect(paceMultiplier(p('low-vision-user'))).toBe(1.0);
    expect(paceMultiplier(p('impatient-user'))).toBe(0.75);
  });

  it('500-case sweep: checklist and pacing invariants hold for every profile', () => {
    const rand = mulberry32(42);
    const pool = listPersonas().concat(['robot', '', 'New-User', 'x-user']);
    for (let i = 0; i < 500; i++) {
      const name = pool[Math.floor(rand() * pool.length)];
      const v = getPersona(name);
      const known = typeof name === 'string' && listPersonas().includes(name.trim().toLowerCase());
      expect(v.ok).toBe(known);
      if (!v.ok || !v.profile) {
        continue;
      }
      const profile = v.profile;
      profile.name = 'mutated';
      const fresh = getPersona(name);
      expect(fresh.ok && fresh.profile?.name).not.toBe('mutated');

      const checks = deriveChecklist(fresh.profile as PersonaProfile);
      expect(checks[0]).toBe('smoke-critical-path');
      expect(checks.includes('keyboard-navigation')).toBe(
        (fresh.profile as PersonaProfile).a11yNeeds,
      );
      expect(checks.includes('onboarding-flow')).toBe(
        (fresh.profile as PersonaProfile).familiarity <= 30,
      );
      expect(checks.includes('loading-feedback')).toBe(
        (fresh.profile as PersonaProfile).patience <= 20,
      );
      const pm = paceMultiplier(fresh.profile as PersonaProfile);
      expect(pm === 0.75 || pm === 1.0 || pm === 1.5).toBe(true);
    }
  });
});
