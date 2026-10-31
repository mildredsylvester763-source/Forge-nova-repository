import {
  buildVariants,
  sanitizeSkuPart,
  validateCatalogName,
  validateOptionSet,
  validateUnitPriceCents,
} from './variant-engine';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('variant-engine (pinned vectors)', () => {
  it('trims catalog names and refuses empty or oversized ones', () => {
    expect(validateCatalogName('  Classic Tee  ')).toEqual({ ok: true, value: 'Classic Tee' });
    expect(validateCatalogName('   ')).toEqual({ ok: false, reason: 'catalog-invalid-name' });
    expect(validateCatalogName('x'.repeat(121))).toEqual({ ok: false, reason: 'catalog-invalid-name' });
  });

  it('accepts a missing option list and refuses broken ones by name', () => {
    expect(validateOptionSet(null)).toEqual({ ok: true, value: [] });
    expect(validateOptionSet(undefined)).toEqual({ ok: true, value: [] });
    expect(validateOptionSet([{ name: 'Size', values: ['S', 'M'] }])).toEqual({
      ok: true,
      value: [{ name: 'Size', values: ['S', 'M'] }],
    });
    expect(
      validateOptionSet([
        { name: 'A', values: ['1', '2'] },
        { name: 'B', values: ['1', '2'] },
        { name: 'C', values: ['1', '2'] },
        { name: 'D', values: ['1', '2'] },
      ]),
    ).toEqual({ ok: false, reason: 'variant-too-many-options' });
    expect(validateOptionSet([{ name: 'n'.repeat(41), values: ['1', '2'] }])).toEqual({
      ok: false,
      reason: 'variant-invalid-option-name',
    });
    expect(validateOptionSet([{ name: 'Size', values: ['S'] }])).toEqual({ ok: false, reason: 'variant-too-few-values' });
    expect(validateOptionSet([{ name: 'Size', values: ['S', 's'] }])).toEqual({
      ok: false,
      reason: 'variant-duplicate-value',
    });
    expect(validateOptionSet([{ name: 'Size', values: ['S', 'x'.repeat(41)] }])).toEqual({
      ok: false,
      reason: 'variant-invalid-value',
    });
    expect(validateOptionSet('nope')).toEqual({ ok: false, reason: 'variant-invalid-options' });
  });

  it('sanitizes sku parts and builds the cartesian grid in a stable order', () => {
    expect(sanitizeSkuPart(' a b--c!? ')).toBe('A-B-C');
    const tee = buildVariants(
      'Classic Tee',
      [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red', 'Blue'] },
      ],
      1999,
    );
    expect(tee).toEqual({
      ok: true,
      value: [
        { sku: 'CLASSIC-TEE-S-RED', optionValues: ['S', 'Red'], unitPriceCents: 1999 },
        { sku: 'CLASSIC-TEE-S-BLUE', optionValues: ['S', 'Blue'], unitPriceCents: 1999 },
        { sku: 'CLASSIC-TEE-M-RED', optionValues: ['M', 'Red'], unitPriceCents: 1999 },
        { sku: 'CLASSIC-TEE-M-BLUE', optionValues: ['M', 'Blue'], unitPriceCents: 1999 },
      ],
    });
    expect(buildVariants(' Widget ', [], 0)).toEqual({
      ok: true,
      value: [{ sku: 'WIDGET', optionValues: [], unitPriceCents: 0 }],
    });
  });

  it('refuses oversized grids, long skus, duplicate skus and broken prices', () => {
    expect(
      buildVariants(
        'T',
        [
          { name: 'A', values: ['1', '2', '3', '4', '5'] },
          { name: 'B', values: ['1', '2', '3', '4', '5'] },
          { name: 'C', values: ['1', '2', '3', '4', '5'] },
        ],
        0,
      ),
    ).toEqual({ ok: false, reason: 'variant-too-many-variants' });
    expect(buildVariants('x'.repeat(63), [{ name: 'A', values: ['1', '2'] }], 0)).toEqual({
      ok: false,
      reason: 'variant-sku-too-long',
    });
    const okEdge = buildVariants('x'.repeat(62), [{ name: 'A', values: ['1', '2'] }], 0);
    expect(okEdge.ok).toBe(true);
    expect(buildVariants('T', [{ name: 'A', values: ['Red', 'red!'] }], 0)).toEqual({
      ok: false,
      reason: 'variant-duplicate-sku',
    });
    expect(validateUnitPriceCents(-1)).toEqual({ ok: false, reason: 'variant-invalid-price' });
    expect(validateUnitPriceCents(1.5)).toEqual({ ok: false, reason: 'variant-invalid-price' });
    expect(validateUnitPriceCents(0)).toEqual({ ok: true, value: 0 });
  });
});

describe('variant-engine (500-case sweep, seed 42)', () => {
  it('option set validity follows the exact count and shape rules', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const nOpts = Math.floor(rng() * 5);
      const options: Array<{ name: string; values: string[] }> = [];
      for (let o = 0; o < nOpts; o++) {
        const nVals = Math.floor(rng() * 5);
        const values: string[] = [];
        for (let v = 0; v < nVals; v++) values.push('V' + v);
        options.push({ name: 'O' + o, values });
      }
      const verdict = validateOptionSet(options);
      const valid = nOpts <= 3 && options.every((o) => o.values.length >= 2);
      expect(verdict.ok).toBe(valid);
    }
  });

  it('built grids always have the exact cartesian count, unique skus and clean forms', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const nOpts = Math.floor(rng() * 4);
      const options: Array<{ name: string; values: string[] }> = [];
      for (let o = 0; o < nOpts; o++) {
        const nVals = 2 + Math.floor(rng() * 4);
        const values: string[] = [];
        for (let v = 0; v < nVals; v++) values.push('V' + v);
        options.push({ name: 'O' + o, values });
      }
      const setVerdict = validateOptionSet(options);
      if (!setVerdict.ok) throw new Error('expected a clean option set');
      const product = setVerdict.value.reduce((acc, o) => acc * o.values.length, 1);
      const built = buildVariants('Base', setVerdict.value, 0);
      if (product > 100) {
        expect(built).toEqual({ ok: false, reason: 'variant-too-many-variants' });
        continue;
      }
      if (!built.ok) throw new Error('expected a built grid');
      expect(built.value).toHaveLength(product);
      const skus = new Set(built.value.map((p) => p.sku));
      expect(skus.size).toBe(product);
      for (const plan of built.value) {
        expect(plan.sku.length).toBeLessThanOrEqual(64);
        expect(/^[A-Z0-9-]+$/.test(plan.sku)).toBe(true);
      }
    }
  });
});
