import {
  buildMetaCatalogItem,
  buildGoogleProductEntry,
  buildShoppingFeedXml,
  planGoogleFeed,
  escapeXml,
  formatPrice,
} from './shop-feed-engine';

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

const oracleUrlOk = (u: unknown): boolean => {
  if (typeof u !== 'string') {
    return false;
  }
  const t = u.trim();
  if (!t.startsWith('https://') || t.length > 2048) {
    return false;
  }
  if (t.split('').some((c) => c === ' ' || c === '\t' || c === '\n')) {
    return false;
  }
  const rest = t.slice(8);
  if (rest.length < 4) {
    return false;
  }
  const hostEnd = Math.min(...[rest.indexOf('/'), rest.indexOf('?')].filter((x) => x >= 0), rest.length);
  const host = rest.slice(0, hostEnd);
  const parts = host.split('.');
  return parts.length >= 2 && parts.every((p) => p.length >= 1 && /^[a-zA-Z0-9-]+$/.test(p));
};

describe('shop-feed-engine', () => {
  test('pinned vectors: meta catalog item builds the exact Meta payload', () => {
    const base = {
      channel: 'instagram',
      sku: 'HAT-01',
      itemGroupId: 'item-1',
      title: 'Red hat',
      description: 'A warm red hat',
      currency: 'usd',
      priceCents: 1299,
      availability: 'in stock',
      condition: 'new',
      imageUrl: 'https://shop.example/hat.jpg',
      productUrl: 'https://shop.example/hat',
      brand: 'Acme',
    };
    const verdict = buildMetaCatalogItem(base);
    expect(verdict.ok).toBe(true);
    expect(JSON.stringify((verdict as { ok: true; value: unknown }).value)).toBe(
      '{"retailer_id":"HAT-01","item_group_id":"item-1","title":"Red hat","description":"A warm red hat","price":{"amount":"12.99","currency":"USD"},"availability":"in stock","condition":"new","image_url":"https://shop.example/hat.jpg","link":"https://shop.example/hat","brand":"Acme"}',
    );
  });

  test('pinned refusals: every invalid meta field is refused by name', () => {
    const base = {
      channel: 'facebook' as unknown,
      sku: 'HAT-01',
      itemGroupId: 'item-1',
      title: 'Red hat',
      description: 'A warm red hat',
      currency: 'usd',
      priceCents: 1299,
      availability: 'in stock',
      condition: 'new',
      imageUrl: 'https://shop.example/hat.jpg',
      productUrl: 'https://shop.example/hat',
      brand: 'Acme',
    };
    const refuse = (patch: Record<string, unknown>, reason: string) => {
      const verdict = buildMetaCatalogItem({ ...base, ...patch });
      expect(verdict.ok).toBe(false);
      expect((verdict as { reason: string }).reason).toBe(reason);
    };
    refuse({ channel: 'tiktok' }, 'feed-unknown-channel');
    refuse({ sku: '' }, 'feed-invalid-sku');
    refuse({ itemGroupId: '' }, 'feed-invalid-item-group');
    refuse({ title: '' }, 'feed-invalid-title');
    refuse({ description: '' }, 'feed-invalid-description');
    refuse({ currency: 'dollars' }, 'feed-invalid-currency');
    refuse({ priceCents: 0 }, 'feed-invalid-price');
    refuse({ priceCents: 1.5 }, 'feed-invalid-price');
    refuse({ availability: 'maybe' }, 'feed-invalid-availability');
    refuse({ availability: 'available for order' }, 'feed-invalid-availability');
    refuse({ condition: 'old' }, 'feed-invalid-condition');
    refuse({ imageUrl: 'http://shop.example/hat.jpg' }, 'feed-invalid-url');
    refuse({ imageUrl: 'https://nohost' }, 'feed-invalid-url');
    refuse({ productUrl: 'https://shop.example/x y' }, 'feed-invalid-url');
    expect(formatPrice(5)).toBe('0.05');
    expect(formatPrice(123456)).toBe('1234.56');
  });

  test('pinned vectors: google merchant entry, price format and identifier rule', () => {
    const gBase = {
      id: 'HAT-01',
      title: 'Red hat',
      description: 'A warm red hat',
      link: 'https://shop.example/hat',
      imageLink: 'https://shop.example/hat.jpg',
      currency: 'USD',
      priceCents: 1299,
      availability: 'in stock',
      condition: 'new',
      brand: 'Acme',
      gtin: undefined,
      mpn: undefined,
      identifierExists: undefined,
    };
    const ok = buildGoogleProductEntry(gBase) as { ok: true; value: { price: string } };
    expect(ok.ok).toBe(true);
    expect(ok.value.price).toBe('12.99 USD');
    const refused = buildGoogleProductEntry({ ...gBase, id: '' }) as { reason: string };
    expect(refused.reason).toBe('feed-invalid-id');
    const noIdent = buildGoogleProductEntry({ ...gBase, brand: undefined }) as { reason: string };
    expect(noIdent.reason).toBe('feed-identifier-required');
    const custom = buildGoogleProductEntry({ ...gBase, brand: undefined, identifierExists: false }) as { ok: true; value: { identifier_exists: string } };
    expect(custom.ok).toBe(true);
    expect(custom.value.identifier_exists).toBe('false');
    const gtinOk = buildGoogleProductEntry({ ...gBase, gtin: '0123456789012' });
    expect(gtinOk.ok).toBe(true);
    const gtinBad = buildGoogleProductEntry({ ...gBase, gtin: '12' }) as { reason: string };
    expect(gtinBad.reason).toBe('feed-invalid-gtin');
    const mpnOk = buildGoogleProductEntry({ ...gBase, brand: undefined, mpn: 'AH-64' });
    expect(mpnOk.ok).toBe(true);
    const idexBad = buildGoogleProductEntry({ ...gBase, brand: undefined, identifierExists: 'no' }) as { reason: string };
    expect(idexBad.reason).toBe('feed-invalid-identifier-exists');
  });

  test('pinned vectors: feed xml escapes special characters and lists optional tags', () => {
    const entry = {
      id: 'HAT-01',
      title: 'Red hat',
      description: 'A warm red hat',
      link: 'https://shop.example/hat',
      image_link: 'https://shop.example/hat.jpg',
      price: '12.99 USD',
      availability: 'in stock',
      condition: 'new',
      brand: 'Acme',
    };
    const xml = buildShoppingFeedXml({ title: 'Shop & Co feed', generatedAtIso: '2026-10-31T12:00:00.000Z', entries: [entry] });
    expect(xml.split('<g:id>HAT-01</g:id>').length).toBe(2);
    expect(xml).toContain('<title>Shop &amp; Co feed</title>');
    expect(xml).toContain('<g:price>12.99 USD</g:price>');
    expect(xml).toContain('<g:brand>Acme</g:brand>');
    expect(xml).not.toContain('<g:gtin>');
    expect(xml).not.toContain('<g:identifier_exists>');
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(escapeXml('a<b>&"c\'')).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });

  test('pinned vectors: planGoogleFeed skips invalid candidates and refuses empty feeds', () => {
    const candidate = (id: string, patch: Record<string, unknown>) => ({
      id,
      input: {
        id,
        title: 'Red hat',
        description: 'A warm red hat',
        link: 'https://shop.example/hat',
        imageLink: 'https://shop.example/hat.jpg',
        currency: 'USD',
        priceCents: 1299,
        availability: 'in stock',
        condition: 'new',
        brand: 'Acme',
        gtin: undefined,
        mpn: undefined,
        identifierExists: undefined,
        ...patch,
      },
    });
    const plan = planGoogleFeed([candidate('A', {}), candidate('B', { priceCents: 0 })]) as {
      ok: true;
      value: { entries: unknown[]; skipped: { id: string; reason: string }[] };
    };
    expect(plan.ok).toBe(true);
    expect(plan.value.entries.length).toBe(1);
    expect(plan.value.skipped).toEqual([{ id: 'B', reason: 'feed-invalid-price' }]);
    const empty = planGoogleFeed([candidate('B', { priceCents: 0 })]) as { reason: string };
    expect(empty.reason).toBe('feed-no-valid-items');
  });

  test('500-case sweep: meta and google builders match the independent oracle', () => {
    const rng = mulberry32(42);
    const META_CHANNELS = ['facebook', 'instagram'];
    const AVAILABILITY_VALUES = ['in stock', 'out of stock', 'preorder', 'backorder'];
    const CONDITION_VALUES = ['new', 'refurbished', 'used'];
    const words = ['hat', 'bag', 'shoe', 'lamp', 'mug', 'pen', 'toy', 'rug'];
    for (let i = 0; i < 500; i += 1) {
      const channel = rng() < 0.8 ? META_CHANNELS[Math.floor(rng() * 2)] : 'tiktok';
      const sku = rng() < 0.9 ? words[Math.floor(rng() * 8)] + '-' + Math.floor(rng() * 100) : '';
      const title = rng() < 0.9 ? 'Product ' + Math.floor(rng() * 1000) : (rng() < 0.5 ? '' : 'x'.repeat(151 + Math.floor(rng() * 50)));
      const description = rng() < 0.85 ? 'A fine product indeed' : 'x'.repeat(5001);
      const currency = rng() < 0.7 ? ['usd', 'EUR', 'gbp', 'NGN'][Math.floor(rng() * 4)] : 'money';
      const priceCents = rng() < 0.8 ? 1 + Math.floor(rng() * 500000) : (rng() < 0.5 ? 0 : 1.5);
      const availability = rng() < 0.85 ? AVAILABILITY_VALUES[Math.floor(rng() * 4)] : 'sometimes';
      const condition = rng() < 0.85 ? CONDITION_VALUES[Math.floor(rng() * 3)] : 'old';
      const hostBits = ['shop', 'example', 'store'];
      const imageUrl =
        'https://' + hostBits[Math.floor(rng() * 3)] + '.' + hostBits[Math.floor(rng() * 3)] + '.co/' + words[Math.floor(rng() * 8)] + '.jpg';
      const productUrl = rng() < 0.9 ? 'https://shop.example/' + words[Math.floor(rng() * 8)] : 'http://shop.example/x';
      const brand = rng() < 0.6 ? 'Acme' : undefined;
      const input = {
        channel,
        sku,
        itemGroupId: 'item-' + (i % 5),
        title,
        description,
        currency,
        priceCents,
        availability,
        condition,
        imageUrl,
        productUrl,
        brand,
      };

      const verdict = buildMetaCatalogItem(input);
      const oTitle = typeof title === 'string' && title.trim().length >= 1 && title.trim().length <= 150;
      const oDesc = typeof description === 'string' && description.trim().length >= 1 && description.trim().length <= 5000;
      const oCur = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency.trim().toUpperCase());
      const oPrice = typeof priceCents === 'number' && Number.isInteger(priceCents) && priceCents >= 1 && priceCents <= 1000000000;
      const oAvail = typeof availability === 'string' && ['in stock', 'out of stock', 'preorder', 'backorder'].includes(availability);
      const oCond = typeof condition === 'string' && ['new', 'refurbished', 'used'].includes(condition);
      const oSku = typeof sku === 'string' && sku.trim().length >= 1 && sku.trim().length <= 100;
      let expected: { ok: boolean; reason?: string; value?: unknown };
      if (!META_CHANNELS.includes(channel)) {
        expected = { ok: false, reason: 'feed-unknown-channel' };
      } else if (!oSku) {
        expected = { ok: false, reason: 'feed-invalid-sku' };
      } else if (!oTitle) {
        expected = { ok: false, reason: 'feed-invalid-title' };
      } else if (!oDesc) {
        expected = { ok: false, reason: 'feed-invalid-description' };
      } else if (!oCur) {
        expected = { ok: false, reason: 'feed-invalid-currency' };
      } else if (!oPrice) {
        expected = { ok: false, reason: 'feed-invalid-price' };
      } else if (!oAvail) {
        expected = { ok: false, reason: 'feed-invalid-availability' };
      } else if (!oCond) {
        expected = { ok: false, reason: 'feed-invalid-condition' };
      } else if (!oracleUrlOk(imageUrl)) {
        expected = { ok: false, reason: 'feed-invalid-url' };
      } else if (!oracleUrlOk(productUrl)) {
        expected = { ok: false, reason: 'feed-invalid-url' };
      } else {
        const cents = priceCents;
        expected = {
          ok: true,
          value: {
            retailer_id: sku.trim(),
            item_group_id: 'item-' + (i % 5),
            title: title.trim(),
            description: description.trim(),
            price: {
              amount: Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0'),
              currency: currency.trim().toUpperCase(),
            },
            availability,
            condition,
            image_url: imageUrl.trim(),
            link: productUrl.trim(),
            ...(brand !== undefined ? { brand } : {}),
          },
        };
      }
      expect(JSON.stringify(verdict)).toBe(JSON.stringify(expected.ok ? { ok: true, value: expected.value } : { ok: false, reason: expected.reason }));

      const gInput = {
        id: sku,
        title,
        description,
        link: productUrl,
        imageLink: imageUrl,
        currency,
        priceCents,
        availability,
        condition,
        brand: rng() < 0.5 ? brand : undefined,
        gtin: rng() < 0.3 ? String(Math.floor(rng() * 10000000000000)).padStart(12, '0').slice(0, 8 + Math.floor(rng() * 7)) : undefined,
        mpn: rng() < 0.3 ? 'MPN-' + Math.floor(rng() * 100) : undefined,
        identifierExists: rng() < 0.5 ? (rng() < 0.5 ? true : false) : undefined,
      };
      const gVerdict = buildGoogleProductEntry(gInput);
      const oGtinOk = gInput.gtin === undefined || /^[0-9]{8,14}$/.test(String(gInput.gtin).trim());
      const oMpnOk = gInput.mpn === undefined || (String(gInput.mpn).trim().length >= 1 && String(gInput.mpn).trim().length <= 50);
      const oBrandOk = gInput.brand === undefined || (String(gInput.brand).trim().length >= 1 && String(gInput.brand).trim().length <= 100);
      let gExpected: { ok: boolean; reason?: string; value?: unknown };
      if (!oSku) {
        gExpected = { ok: false, reason: 'feed-invalid-id' };
      } else if (!oTitle) {
        gExpected = { ok: false, reason: 'feed-invalid-title' };
      } else if (!oDesc) {
        gExpected = { ok: false, reason: 'feed-invalid-description' };
      } else if (!oracleUrlOk(gInput.link)) {
        gExpected = { ok: false, reason: 'feed-invalid-url' };
      } else if (!oracleUrlOk(gInput.imageLink)) {
        gExpected = { ok: false, reason: 'feed-invalid-url' };
      } else if (!oCur) {
        gExpected = { ok: false, reason: 'feed-invalid-currency' };
      } else if (!oPrice) {
        gExpected = { ok: false, reason: 'feed-invalid-price' };
      } else if (!oAvail) {
        gExpected = { ok: false, reason: 'feed-invalid-availability' };
      } else if (!oCond) {
        gExpected = { ok: false, reason: 'feed-invalid-condition' };
      } else if (!oBrandOk) {
        gExpected = { ok: false, reason: 'feed-invalid-brand' };
      } else if (!oGtinOk) {
        gExpected = { ok: false, reason: 'feed-invalid-gtin' };
      } else if (!oMpnOk) {
        gExpected = { ok: false, reason: 'feed-invalid-mpn' };
      } else if (gInput.identifierExists !== undefined && typeof gInput.identifierExists !== 'boolean') {
        gExpected = { ok: false, reason: 'feed-invalid-identifier-exists' };
      } else if (gInput.brand === undefined && gInput.gtin === undefined && gInput.mpn === undefined && gInput.identifierExists !== false) {
        gExpected = { ok: false, reason: 'feed-identifier-required' };
      } else {
        const cents = priceCents;
        const ev: Record<string, unknown> = {
          id: sku.trim(),
          title: title.trim(),
          description: description.trim(),
          link: gInput.link.trim(),
          image_link: gInput.imageLink.trim(),
          price: Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0') + ' ' + currency.trim().toUpperCase(),
          availability,
          condition,
        };
        if (gInput.brand !== undefined) {
          ev.brand = gInput.brand;
        }
        if (gInput.gtin !== undefined) {
          ev.gtin = gInput.gtin.trim();
        }
        if (gInput.mpn !== undefined) {
          ev.mpn = gInput.mpn.trim();
        }
        if (gInput.identifierExists === false) {
          ev.identifier_exists = 'false';
        }
        gExpected = { ok: true, value: ev };
      }
      expect(JSON.stringify(gVerdict)).toBe(JSON.stringify(gExpected.ok ? { ok: true, value: gExpected.value } : { ok: false, reason: gExpected.reason }));
    }
  });
});
