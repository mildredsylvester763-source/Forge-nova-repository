import {
  classifyIntent,
  INTENTS,
  INTENT_RULES,
  INTENT_TEXT_LIMIT,
} from './intent-classification';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('intent-classification engine (FORGE AI-073)', () => {
  it('classifies the pinned request vectors with exact scores and confidence', () => {
    const q = classifyIntent({ text: 'How do I fix the broken build?' });
    expect(q).toMatchObject({ ok: true, intent: 'question', score: 2, confidence: 0.5 });
    const c = classifyIntent({ text: 'Write a blog post about orchestration' });
    expect(c).toMatchObject({ ok: true, intent: 'creation', score: 1, confidence: 1 });
    const cmp = classifyIntent({ text: 'Compare postgres vs mysql for our app' });
    expect(cmp).toMatchObject({ ok: true, intent: 'comparison', score: 2, confidence: 1 });
    const g = classifyIntent({ text: 'hello there friend' });
    expect(g).toMatchObject({ ok: true, intent: 'conversation', score: 1, confidence: 1 });
    const f = classifyIntent({ text: 'Fix and update the login bug now' });
    expect(f).toMatchObject({ ok: true, intent: 'command', score: 2, confidence: 1 });
    const a = classifyIntent({ text: 'Analyze and summarize the audit results' });
    expect(a).toMatchObject({ ok: true, intent: 'analysis', score: 3, confidence: 1 });
  });

  it('breaks score ties in catalog order and refuses unmatched or unroutable text', () => {
    const tie = classifyIntent({ text: 'how to write' });
    expect(tie).toMatchObject({ ok: true, intent: 'question' });
    expect(classifyIntent({ text: 'banana' })).toMatchObject({ reason: 'intent-no-match' });
    expect(classifyIntent({})).toMatchObject({ reason: 'intent-text-missing' });
    expect(classifyIntent({ text: '   ' })).toMatchObject({ reason: 'intent-text-missing' });
    expect(classifyIntent({ text: 'x'.repeat(2001) })).toMatchObject({
      reason: 'intent-text-too-long',
    });
    expect(
      classifyIntent({ text: 'what is a database', allowed: ['command'] }),
    ).toMatchObject({ reason: 'intent-not-allowed:question' });
    expect(
      classifyIntent({ text: 'what is a database', allowed: ['command', 'chitchat'] }),
    ).toMatchObject({ reason: 'intent-allowlist-unknown:chitchat' });
    expect(classifyIntent({ text: 'fix the build', allowed: ['command'] })).toMatchObject({
      ok: true,
      intent: 'command',
    });
  });

  it('exposes the intent catalog and rule table', () => {
    expect(INTENTS).toEqual([
      'question',
      'command',
      'creation',
      'analysis',
      'comparison',
      'conversation',
    ]);
    expect(INTENT_RULES.question).toContain('how');
    expect(INTENT_RULES.command).toContain('set up');
    expect(INTENT_RULES.comparison).toContain('pros and cons');
    expect(INTENT_TEXT_LIMIT).toBe(2000);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const POOL: string[] = [];
    for (const intent of INTENTS) {
      POOL.push(...INTENT_RULES[intent]);
    }
    POOL.push(
      'banana',
      'orchestra',
      'deployed',
      'writer',
      'vsuffix',
      'running',
      'please',
      'now',
      'system',
    );
    const ORACLE_RULES: Record<string, string[]> = {
      question: ['what', 'why', 'how', 'when', 'where', 'who', 'which', '?'],
      command: [
        'fix',
        'add',
        'delete',
        'update',
        'deploy',
        'run',
        'make',
        'set up',
        'configure',
        'install',
      ],
      creation: ['write', 'draft', 'design', 'compose', 'build', 'generate', 'create'],
      analysis: ['analyze', 'review', 'audit', 'explain', 'summarize', 'evaluate'],
      comparison: ['compare', 'versus', 'vs', 'difference', 'better', 'pros and cons'],
      conversation: ['hi', 'hello', 'thanks', 'thank you', 'good morning', 'hey'],
    };
    function oracleCount(text: string, kw: string): number {
      if (kw === '?') return text.split('?').length - 1;
      const words = text
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/^[^a-z]+|[^a-z]+$/g, ''));
      const parts = kw.split(' ');
      if (parts.length === 1) return words.filter((w) => w === kw).length;
      let n = 0;
      for (let i = 0; i + parts.length <= words.length; i++) {
        let hit = true;
        for (let j = 0; j < parts.length; j++) {
          if (words[i + j] !== parts[j]) hit = false;
        }
        if (hit) n++;
      }
      return n;
    }
    for (let c = 0; c < 500; c++) {
      let text: string;
      const kind = rand();
      if (kind < 0.04) {
        text = '';
      } else if (kind < 0.06) {
        text = 'x'.repeat(2001 + Math.floor(rand() * 10));
      } else {
        const words: string[] = [];
        const n = Math.floor(rand() * 8);
        for (let i = 0; i < n; i++) {
          words.push(POOL[Math.floor(rand() * POOL.length)]);
        }
        text = words.join(' ');
        if (rand() < 0.3) text = text + '?';
      }
      let allowed: string[] | undefined;
      if (rand() < 0.3) {
        allowed = [];
        const an = Math.floor(rand() * 3);
        for (let i = 0; i < an; i++) {
          allowed.push(rand() < 0.85 ? INTENTS[Math.floor(rand() * INTENTS.length)] : 'chitchat');
        }
      }
      const got = classifyIntent({ text, allowed });
      const trimmed = text.trim();
      const bad = allowed ? allowed.find((x) => !INTENTS.includes(x)) : undefined;
      let expOk = true;
      let expReason = '';
      let expIntent = '';
      let expScore = 0;
      let expConf = 0;
      if (trimmed.length === 0) {
        expOk = false;
        expReason = 'intent-text-missing';
      } else if (trimmed.length > INTENT_TEXT_LIMIT) {
        expOk = false;
        expReason = 'intent-text-too-long';
      } else if (bad) {
        expOk = false;
        expReason = 'intent-allowlist-unknown:' + bad;
      } else {
        let total = 0;
        let bestScore = -1;
        let bestIntent = '';
        for (const intent of INTENTS) {
          let s = 0;
          for (const kw of ORACLE_RULES[intent]) {
            s += oracleCount(trimmed, kw);
          }
          total += s;
          if (s > bestScore) {
            bestScore = s;
            bestIntent = intent;
          }
        }
        if (bestScore === 0) {
          expOk = false;
          expReason = 'intent-no-match';
        } else if (allowed && !allowed.includes(bestIntent)) {
          expOk = false;
          expReason = 'intent-not-allowed:' + bestIntent;
        } else {
          expIntent = bestIntent;
          expScore = bestScore;
          expConf = Number((bestScore / total).toFixed(2));
        }
      }
      expect(got.ok).toBe(expOk);
      if (expOk) {
        expect(got.intent).toBe(expIntent);
        expect(got.score).toBe(expScore);
        expect(got.confidence).toBe(expConf);
      } else {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });
});
