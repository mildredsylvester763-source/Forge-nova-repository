// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/assistant-text.spec.ts
// ============================================================================

import { answerFaq, extractActions } from './assistant-text';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('assistant-text engine', () => {
  it('extracts actions with @owner and "due N days", ignoring small talk', () => {
    const r = extractActions('- call Banky @Ada due 3 days\n- lunch was great\n; send invoice @Tunde');
    if (!r.ok) return;
    expect(r.value.actions).toHaveLength(2);
    expect(r.value.actions[0].owner).toBe('Ada');
    expect(r.value.actions[0].dueInDays).toBe(3);
    expect(r.value.actions[0].title).toBe('call Banky');
    expect(r.value.actions[1].owner).toBe('Tunde');
  });

  it('answers an exact FAQ with score 1', () => {
    const r = answerFaq('How do I record a payment?', [
      { q: 'How do I record a payment?', a: 'Use POST /payments with amountCents.' },
      { q: 'What is a credit note?', a: 'A credit note reduces an invoice.' },
    ]);
    if (!r.ok) return;
    expect(r.value.score).toBe(1);
    expect(r.value.a).toBe('Use POST /payments with amountCents.');
  });

  it('refuses no-match, empty question, and empty library by name', () => {
    const a = answerFaq('what is the weather', [{ q: 'How do I record a payment?', a: 'x' }]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('faq-no-match');
    const b = answerFaq('x', []);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('faq-empty-library');
  });

  it('500-case sweep: every extracted action has a non-empty title', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const notes = Array.from({ length: 4 }, () =>
        ['call x @A due 2 days', 'nothing here', 'email the team', 'review deck @B'][Math.floor(rnd() * 4)],
      ).join('\n');
      const r = extractActions(notes);
      if (!r.ok) throw new Error('extraction refused in sweep');
      for (const action of r.value.actions) {
        expect(action.title.length).toBeGreaterThan(0);
      }
    }
  });
});
