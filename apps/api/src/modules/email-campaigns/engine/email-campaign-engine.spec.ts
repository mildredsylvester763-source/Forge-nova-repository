import {
  validateBlock,
  validateBlocks,
  validateEmail,
  validateEventType,
  planPublishTemplate,
  renderTemplate,
  computeCampaignMetrics,
} from './email-campaign-engine';

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('email-campaign-engine', () => {
  test('pinned vectors: render fills merge variables and keeps blocks in order', () => {
    const verdict = renderTemplate({
      subject: 'Hi {{first_name}}!',
      blocks: [
        { type: 'heading', text: 'Hello {{first_name}}' },
        { type: 'text', body: 'A deal for you, {{first_name}} from {{shop_name}}' },
        { type: 'image', url: 'https://cdn.example.com/hero.jpg', alt: 'Hero shot' },
        { type: 'button', label: 'Shop now', url: 'https://shop.example.com/sale' },
        { type: 'divider' },
      ],
      values: { first_name: 'Ada', shop_name: 'Ada & Co' },
    });
    expect(verdict.ok).toBe(true);
    const value = (verdict as { ok: true; value: { subject: string; preview: string } }).value;
    expect(value.subject).toBe('Hi Ada!');
    expect(value.preview).toBe(
      'Hello Ada\n\nA deal for you, Ada from Ada & Co\n\n[image: Hero shot](https://cdn.example.com/hero.jpg)\n\n[button: Shop now](https://shop.example.com/sale)\n\n---',
    );
  });

  test('pinned refusals: missing and unknown variables, bad blocks, bad lists', () => {
    const miss = renderTemplate({
      subject: 'Hi',
      blocks: [{ type: 'heading', text: 'Hey {{last_name}}' }],
      values: {},
    }) as { reason: string };
    expect(miss.reason).toBe('template-missing-variable');
    const unknown = renderTemplate({
      subject: 'Hi {{nickname}}',
      blocks: [{ type: 'heading', text: 'x' }],
      values: {},
    }) as { reason: string };
    expect(unknown.reason).toBe('template-unknown-variable');
    const blockUnknown = validateBlock({ type: 'text', body: 'Hi {{nickname}}' }) as { reason: string };
    expect(blockUnknown.reason).toBe('template-unknown-variable');
    expect((validateBlock({ type: 'spinner' }) as { reason: string }).reason).toBe('template-invalid-block-type');
    expect(
      (validateBlock({ type: 'image', url: 'http://x.example/i.jpg', alt: 'x' }) as { reason: string }).reason,
    ).toBe('template-invalid-image-url');
    expect(
      (validateBlock({ type: 'image', url: 'https://x.example/i.jpg', alt: '' }) as { reason: string }).reason,
    ).toBe('template-invalid-image-alt');
    expect(
      (validateBlock({ type: 'button', label: 'x'.repeat(51), url: 'https://a.example/b' }) as { reason: string })
        .reason,
    ).toBe('template-invalid-button-label');
    expect(validateBlock({ type: 'button', label: 'Go', url: 'https://a.example/b' }).ok).toBe(true);
    expect((validateBlocks([]) as { reason: string }).reason).toBe('template-no-blocks');
    expect(
      (validateBlocks(new Array(51).fill({ type: 'divider' })) as { reason: string }).reason,
    ).toBe('template-too-many-blocks');
  });

  test('pinned vectors: publish is a one-way door and emails are strict', () => {
    expect(planPublishTemplate('draft')).toEqual({ ok: true, value: 'published' });
    expect((planPublishTemplate('published') as { reason: string }).reason).toBe('template-already-published');
    expect((planPublishTemplate('garbage') as { reason: string }).reason).toBe('template-invalid-status');
    expect(validateEmail('ada@example.com')).toEqual({ ok: true, value: 'ada@example.com' });
    expect((validateEmail('no-at-sign.example') as { reason: string }).reason).toBe('analytics-invalid-email');
    expect((validateEmail('a@b@c.com') as { reason: string }).reason).toBe('analytics-invalid-email');
    expect((validateEmail('a@b') as { reason: string }).reason).toBe('analytics-invalid-email');
    expect((validateEventType('forwarded') as { reason: string }).reason).toBe('analytics-invalid-event-type');
    expect(validateEventType('open')).toEqual({ ok: true, value: 'open' });
  });

  test('pinned vectors: metrics follow the industry formulas exactly', () => {
    const ev = (email: string, type: string) => ({ email, type });
    const metrics = computeCampaignMetrics([
      ev('a@example.com', 'sent'),
      ev('b@example.com', 'sent'),
      ev('c@example.com', 'sent'),
      ev('d@example.com', 'sent'),
      ev('e@example.com', 'sent'),
      ev('a@example.com', 'bounce'),
      ev('b@example.com', 'open'),
      ev('c@example.com', 'open'),
      ev('d@example.com', 'open'),
      ev('b@example.com', 'click'),
      ev('e@example.com', 'unsubscribe'),
    ]);
    expect(metrics).toEqual({
      recipients: 5,
      sent: 5,
      delivered: 4,
      opens: 3,
      uniqueClicks: 1,
      unsubscribes: 1,
      bounces: 1,
      openRate: 75,
      clickRate: 25,
      bounceRate: 20,
      unsubscribeRate: 25,
      deliveryRate: 80,
    });
    expect(computeCampaignMetrics([])).toEqual({
      recipients: 0,
      sent: 0,
      delivered: 0,
      opens: 0,
      uniqueClicks: 0,
      unsubscribes: 0,
      bounces: 0,
      openRate: 0,
      clickRate: 0,
      bounceRate: 0,
      unsubscribeRate: 0,
      deliveryRate: 0,
    });
    expect(
      computeCampaignMetrics([ev('x@y.co', 'open'), ev('x@y.co', 'open'), ev('x@y.co', 'click')]).opens,
    ).toBe(1);
  });

  test('500-case sweep: metrics match the independent oracle', () => {
    const rng = mulberry32(42);
    const pool = [
      'a@example.com', 'b@example.com', 'c@example.com', 'd@example.com',
      'e@example.com', 'f@example.com', 'g@example.com', 'h@example.com',
    ];
    const eventTypes = ['sent', 'open', 'click', 'bounce', 'unsubscribe'];
    const oracleRate = (num: number, den: number): number => (den > 0 ? Math.round((num * 10000) / den) / 100 : 0);
    for (let i = 0; i < 500; i += 1) {
      const n = Math.floor(rng() * 30);
      const events: { email: string; type: string }[] = [];
      for (let j = 0; j < n; j += 1) {
        events.push({ email: pool[Math.floor(rng() * 8)], type: eventTypes[Math.floor(rng() * 5)] });
      }
      const got = computeCampaignMetrics(events);
      const seen: Record<string, boolean> = {};
      const uniq = (target: string): string[] => {
        const set: string[] = [];
        for (const e of events) {
          if (e.type === target && !set.includes(e.email)) {
            set.push(e.email);
          }
        }
        return set;
      };
      for (const e of events) {
        seen[e.email] = true;
      }
      const recipientList = Object.keys(seen);
      const boun = uniq('bounce');
      const op = uniq('open');
      const cl = uniq('click');
      const un = uniq('unsubscribe');
      let sentN = 0;
      for (const e of events) {
        if (e.type === 'sent') {
          sentN += 1;
        }
      }
      const deliv = recipientList.length - boun.length;
      expect(got).toEqual({
        recipients: recipientList.length,
        sent: sentN,
        delivered: deliv,
        opens: op.length,
        uniqueClicks: cl.length,
        unsubscribes: un.length,
        bounces: boun.length,
        openRate: oracleRate(op.length, deliv),
        clickRate: oracleRate(cl.length, deliv),
        bounceRate: oracleRate(boun.length, recipientList.length),
        unsubscribeRate: oracleRate(un.length, deliv),
        deliveryRate: oracleRate(deliv, recipientList.length),
      });
    }
  });

  test('500-case sweep: block validation and rendering match the oracle', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i += 1) {
      const mkType = ['heading', 'text', 'image', 'button', 'divider', 'spinner'][Math.floor(rng() * 6)];
      let block: Record<string, unknown>;
      let expOk = true;
      let expRender: string | null = null;
      const varText = rng() < 0.3 ? 'Hi {{first_name}}' : 'Plain words';
      if (mkType === 'heading') {
        const text = rng() < 0.85 ? varText : 'x'.repeat(201);
        block = { type: 'heading', text };
        if (text.length > 200) {
          expOk = false;
        } else {
          expRender = text.trim();
        }
      } else if (mkType === 'text') {
        const body = rng() < 0.85 ? varText : 'x'.repeat(10001);
        block = { type: 'text', body };
        if (body.length > 10000) {
          expOk = false;
        } else {
          expRender = body.trim();
        }
      } else if (mkType === 'image') {
        const url = rng() < 0.8 ? 'https://cdn.example.com/i' + i + '.jpg' : 'http://cdn.example.com/i.jpg';
        const alt = rng() < 0.85 ? 'Alt text ' + i : '';
        block = { type: 'image', url, alt };
        if (!String(url).startsWith('https://') || alt.length < 1) {
          expOk = false;
        } else {
          expRender = '[image: ' + alt + '](' + url + ')';
        }
      } else if (mkType === 'button') {
        const label = rng() < 0.85 ? 'Button ' + i : 'x'.repeat(51);
        const url = rng() < 0.8 ? 'https://shop.example.com/go' + i : 'notaurl';
        block = { type: 'button', label, url };
        if (label.length > 50 || !String(url).startsWith('https://')) {
          expOk = false;
        } else {
          expRender = '[button: ' + label + '](https://shop.example.com/go' + i + ')';
        }
      } else if (mkType === 'divider') {
        block = { type: 'divider' };
        expRender = '---';
      } else {
        block = { type: 'spinner' };
        expOk = false;
      }
      const verdict = validateBlock(block);
      expect(verdict.ok).toBe(expOk);
      if (expOk && expRender !== null) {
        const rendered = renderTemplate({
          subject: 'Sweep subject',
          blocks: [verdict.value],
          values: { first_name: 'Ada' },
        });
        expect(rendered.ok).toBe(true);
        const value = (rendered as { ok: true; value: { preview: string } }).value;
        expect(value.preview).toBe(expRender.split('{{first_name}}').join('Ada'));
      }
    }
  });
});
