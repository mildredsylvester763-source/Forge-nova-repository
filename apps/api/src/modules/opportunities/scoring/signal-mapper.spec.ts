import { mapSignalsToSubScores } from './signal-mapper';
import { computeScore } from './scoring.service';

describe('mapSignalsToSubScores', () => {
  it('maps Twitter mentions on the log ladder: 100→4, 10k→8, 100k→10', () => {
    expect(mapSignalsToSubScores({ twitter: { mentions: 100, growthRate: 0 } }).demand).toBe(4);
    expect(mapSignalsToSubScores({ twitter: { mentions: 10000, growthRate: 0 } }).demand).toBe(8);
    expect(mapSignalsToSubScores({ twitter: { mentions: 1000000, growthRate: 0 } }).demand).toBe(10);
  });

  it('maps Reddit combined engagement and upvote-ratio trend with 5 neutral', () => {
    const r = mapSignalsToSubScores({ reddit: { upvotes: 1000, comments: 0, growthRate: 0 } });
    expect(r.demand).toBe(6);
    expect(r.trend).toBe(5);
    const hot = mapSignalsToSubScores({ reddit: { upvotes: 0, comments: 0, growthRate: 50 } });
    expect(hot.trend).toBe(10);
  });

  it('maps GitHub stars and caps demand at 10', () => {
    const g = mapSignalsToSubScores({ socialMedia: { github: { stars: 50000, growthRate: 20 } } });
    expect(g.demand).toBe(10);
    expect(g.trend).toBe(2);
  });

  it('returns an empty map for unknown/Google sources — never invents', () => {
    expect(mapSignalsToSubScores({ googleTrends: {} })).toEqual({});
    expect(mapSignalsToSubScores(undefined)).toEqual({});
    expect(mapSignalsToSubScores(null)).toEqual({});
  });

  it('feeds computeScore: unknown sources land in missingSignals', () => {
    const r = computeScore(mapSignalsToSubScores({ googleTrends: {} }));
    expect(r.missingSignals).toContain('demand');
    expect(r.missingSignals).toContain('trend');
    const t = computeScore(mapSignalsToSubScores({ twitter: { mentions: 10000, growthRate: 30 } }));
    expect(t.missingSignals).not.toContain('demand');
    expect(t.missingSignals).not.toContain('trend');
    expect(t.composite).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const input = { twitter: { mentions: 2500, growthRate: 12 } };
    expect(mapSignalsToSubScores(input)).toEqual(mapSignalsToSubScores(input));
  });
});
