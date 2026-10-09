import { assessRegulatoryRisk, classifyCategory } from './regulatory-risk';

describe('assessRegulatoryRisk pinned vectors', () => {
  it('packaged food in Nigeria is launch-blocking (NAFDAC) and flagged high', () => {
    const r = assessRegulatoryRisk('NG', 'packaged food and snacks');
    expect(r.categoryClass).toBe('food');
    expect(r.flags.some(f => f.code === 'NG_NAFDAC' && f.severity === 'critical')).toBe(true);
    expect(r.riskLevel).toBe('high');
    expect(r.checklist.some(c => c.includes('BLOCKER'))).toBe(true);
    expect(r.checklist.some(c => c.includes('not legal advice'))).toBe(true);
  });

  it('toys for children in the US trigger COPPA at critical severity', () => {
    const r = assessRegulatoryRisk('US', 'toys for children under 10');
    expect(r.categoryClass).toBe('kids');
    expect(r.flags.some(f => f.code === 'US_COPPA')).toBe(true);
    expect(r.riskLevel).toBe('high');
  });

  it('an unknown country degrades to the global baseline with a warning, never silence', () => {
    const r = assessRegulatoryRisk('BR', 'consulting');
    expect(r.warnings.some(w => w.includes('No specific rulebook'))).toBe(true);
    expect(r.flags.some(f => f.code === 'TAX_REG')).toBe(true);
    expect(r.flags.some(f => f.code === 'CONSUMER_LAW')).toBe(true);
    expect(r.riskLevel).toBe('medium'); // one warning flag.
  });

  it('finance anywhere in the US is critical until proven licensed', () => {
    const r = assessRegulatoryRisk('US', 'fintech lending app');
    expect(r.categoryClass).toBe('finance');
    expect(r.flags.some(f => f.code === 'US_MSB' && f.severity === 'critical')).toBe(true);
  });

  it('data products serving EU people carry GDPR at critical', () => {
    const r = assessRegulatoryRisk('DE', 'lead generation datasets');
    expect(r.categoryClass).toBe('data');
    expect(r.flags.some(f => f.code === 'EU_GDPR' && f.severity === 'critical')).toBe(true);
  });

  it('classifyCategory resolves by keyword, specific before general', () => {
    expect(classifyCategory('dietary supplement')).toBe('food');
    expect(classifyCategory('cosmetic skincare')).toBe('health');
    expect(classifyCategory('AI wrappers')).toBe('digital');
    expect(classifyCategory('3d printing')).toBe('physical');
    expect(classifyCategory('random unknown thing')).toBe('default');
  });

  it('severity ordering puts critical first, deterministically', () => {
    const r = assessRegulatoryRisk('GB', 'home bakery');
    const severities = r.flags.map(f => f.severity);
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
    }
    expect(assessRegulatoryRisk('GB', 'home bakery')).toEqual(r);
  });
});
