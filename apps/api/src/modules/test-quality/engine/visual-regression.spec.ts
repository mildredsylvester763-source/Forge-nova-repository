import { diffImages } from './visual-regression';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('visual-regression engine (FORGE TQ-039)', () => {
  it('diffs identical and differing images with perceptual weighting', () => {
    const base = { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] };
    const same = diffImages({ baseline: base, candidate: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] } });
    expect(same.ok).toBe(true);
    expect(same.different).toBe(0);
    expect(same.identical).toBe(true);
    expect(same.diffPercent).toBe(0);
    const white = { width: 2, height: 2, pixels: ['#ffffff', '#000000', '#000000', '#000000'] };
    const big = diffImages({ baseline: base, candidate: white });
    expect(big.different).toBe(1);
    expect(big.total).toBe(4);
    expect(big.diffPercent).toBe(25);
    expect(big.identical).toBe(false);
    const tolerant = diffImages({ baseline: base, candidate: white, threshold: 1 });
    expect(tolerant.identical).toBe(true);
    expect(tolerant.different).toBe(0);
    const near = diffImages({
      baseline: { width: 1, height: 1, pixels: ['#646464'] },
      candidate: { width: 1, height: 1, pixels: ['#656464'] },
    });
    expect(near.identical).toBe(true);
  });

  it('masks ignore regions out of the comparable set', () => {
    const base = { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] };
    const white = { width: 2, height: 2, pixels: ['#ffffff', '#000000', '#000000', '#000000'] };
    const masked = diffImages({ baseline: base, candidate: white, ignoreRegions: [{ x: 0, y: 0, width: 1, height: 1 }] });
    expect(masked.different).toBe(0);
    expect(masked.ignored).toBe(1);
    expect(masked.diffPercent).toBe(0);
    expect(masked.identical).toBe(true);
  });

  it('refuses invalid images, thresholds and regions with named reasons', () => {
    expect(diffImages({ baseline: null, candidate: null })).toMatchObject({
      reason: 'visual-image-missing:baseline',
    });
    expect(
      diffImages({
        baseline: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
        candidate: null,
      }),
    ).toMatchObject({ reason: 'visual-image-missing:candidate' });
    expect(diffImages({ baseline: { width: 0, height: 2, pixels: [] }, candidate: { width: 0, height: 2, pixels: [] } })).toMatchObject({
      reason: 'visual-dimension-invalid:baseline:width',
    });
    expect(
      diffImages({
        baseline: { width: 2, height: 2.5, pixels: [] },
        candidate: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
      }),
    ).toMatchObject({ reason: 'visual-dimension-invalid:baseline:height' });
    expect(
      diffImages({
        baseline: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000'] },
        candidate: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
      }),
    ).toMatchObject({ reason: 'visual-pixels-invalid:baseline' });
    expect(
      diffImages({
        baseline: { width: 2, height: 2, pixels: ['#000000', 'red', '#000000', '#000000'] },
        candidate: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
      }),
    ).toMatchObject({ reason: 'visual-pixel-invalid:baseline:2' });
    expect(
      diffImages({
        baseline: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
        candidate: { width: 3, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000', '#000000', '#000000'] },
      }),
    ).toMatchObject({ reason: 'visual-size-mismatch:2x2:3x2' });
    expect(
      diffImages({
        baseline: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
        candidate: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
        threshold: 1.5,
      }),
    ).toMatchObject({ reason: 'visual-threshold-invalid:1.5' });
    expect(
      diffImages({
        baseline: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
        candidate: { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] },
        ignoreRegions: [{ x: 2, y: 0, width: 1, height: 1 }],
      }),
    ).toMatchObject({ reason: 'visual-region-invalid:1' });
  });

  it('matches an independent reduce oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const WEIGHTS = [0.299, 0.587, 0.114];
    const channels = (hex: string): number[] => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const randPixel = (): string => {
      const r = Math.floor(rand() * 256).toString(16).padStart(2, '0');
      const g = Math.floor(rand() * 256).toString(16).padStart(2, '0');
      const b = Math.floor(rand() * 256).toString(16).padStart(2, '0');
      return '#' + r + g + b;
    };
    for (let c = 0; c < 500; c++) {
      const w = 1 + Math.floor(rand() * 6);
      const h = 1 + Math.floor(rand() * 6);
      const n = w * h;
      const basePixels: string[] = [];
      const candPixels: string[] = [];
      for (let i = 0; i < n; i++) {
        basePixels.push(randPixel());
        candPixels.push(rand() < 0.6 ? basePixels[i] : randPixel());
      }
      const threshold = Math.round(rand() * 100) / 100;
      const regions: Array<{ x: number; y: number; width: number; height: number }> = [];
      if (rand() < 0.4 && w > 1 && h > 1) {
        const rx = Math.floor(rand() * w);
        const ry = Math.floor(rand() * h);
        regions.push({
          x: rx,
          y: ry,
          width: 1 + Math.floor(rand() * (w - rx)),
          height: 1 + Math.floor(rand() * (h - ry)),
        });
      }
      const verdict = diffImages({
        baseline: { width: w, height: h, pixels: basePixels },
        candidate: { width: w, height: h, pixels: candPixels },
        threshold,
        ignoreRegions: regions.length > 0 ? regions : undefined,
      });
      expect(verdict.ok).toBe(true);
      const ignoreGrid: boolean[][] = [];
      for (let y = 0; y < h; y++) {
        const row: boolean[] = [];
        for (let x = 0; x < w; x++) row.push(false);
        ignoreGrid.push(row);
      }
      for (const r of regions) {
        for (let y = r.y; y < r.y + r.height; y++) {
          for (let x = r.x; x < r.x + r.width; x++) ignoreGrid[y][x] = true;
        }
      }
      const limit = threshold * 255;
      let expDifferent = 0;
      let expIgnored = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const index = y * w + x;
          if (ignoreGrid[y][x]) {
            expIgnored++;
            continue;
          }
          const ca = channels(basePixels[index]);
          const cb = channels(candPixels[index]);
          const delta = WEIGHTS.reduce((acc, weight, i) => acc + weight * Math.abs(ca[i] - cb[i]), 0);
          if (delta > limit) expDifferent++;
        }
      }
      const comparable = n - expIgnored;
      const expPercent = comparable === 0 ? 0 : Number(((expDifferent / comparable) * 100).toFixed(2));
      expect(verdict.different).toBe(expDifferent);
      expect(verdict.ignored).toBe(expIgnored);
      expect(verdict.diffPercent).toBe(expPercent);
      expect(verdict.identical).toBe(expDifferent === 0);
    }
  });
});
