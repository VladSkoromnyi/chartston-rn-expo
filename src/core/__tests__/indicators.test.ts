import { describe, expect, it } from 'vitest';
import {
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic,
  vwap,
  wma,
} from '../indicators/calculators';

const nanAt = (a: number[], i: number) => Number.isNaN(a[i]!);

describe('sma', () => {
  it('warms up then averages', () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(nanAt(out, 0)).toBe(true);
    expect(nanAt(out, 1)).toBe(true);
    expect(out[2]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4);
  });
});

describe('ema', () => {
  it('seeds with SMA and tracks (k = 0.5 for period 3)', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBeCloseTo(2); // SMA seed of [1,2,3]
    expect(out[3]).toBeCloseTo(3); // 4*0.5 + 2*0.5
    expect(out[4]).toBeCloseTo(4); // 5*0.5 + 3*0.5
  });
  it('of a constant equals the constant', () => {
    expect(ema([7, 7, 7, 7, 7], 3)[4]).toBeCloseTo(7);
  });
});

describe('wma', () => {
  it('weights recent values more', () => {
    // (3*3 + 2*2 + 1*1) / (3+2+1) = 14/6
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo(14 / 6);
  });
});

describe('bollinger', () => {
  it('collapses to the mean for a constant series', () => {
    const { middle, upper, lower } = bollinger([10, 10, 10, 10, 10], 3, 2);
    expect(middle[4]).toBeCloseTo(10);
    expect(upper[4]).toBeCloseTo(10);
    expect(lower[4]).toBeCloseTo(10);
  });
  it('straddles the middle by mult*sd', () => {
    const { middle, upper, lower } = bollinger([1, 2, 3, 4, 5], 5, 2);
    expect(middle[4]).toBeCloseTo(3);
    expect(upper[4]).toBeCloseTo(3 + 2 * Math.SQRT2); // population sd = sqrt(2)
    expect(lower[4]).toBeCloseTo(3 - 2 * Math.SQRT2);
  });
});

describe('rsi (Wilder)', () => {
  it('is 100 for a strictly rising series', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(closes, 14)[19]).toBeCloseTo(100);
  });
  it('is 0 for a strictly falling series', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(rsi(closes, 14)[19]).toBeCloseTo(0);
  });
  it('stays within [0, 100]', () => {
    const closes = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64, 46.21,
    ];
    for (const v of rsi(closes, 14)) {
      if (!Number.isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('macd', () => {
  it('histogram = macd - signal', () => {
    const closes = Array.from(
      { length: 60 },
      (_, i) => 100 + Math.sin(i / 5) * 10
    );
    const { macd: line, signal, histogram } = macd(closes, 12, 26, 9);
    expect(histogram[59]).toBeCloseTo(line[59]! - signal[59]!);
  });
  it('is ~0 for a constant series', () => {
    expect(macd(new Array(60).fill(100)).macd[59]).toBeCloseTo(0);
  });
});

describe('atr (Wilder)', () => {
  it('equals the constant true range', () => {
    const n = 30;
    const out = atr(
      new Array(n).fill(11),
      new Array(n).fill(10),
      new Array(n).fill(10.5),
      14
    );
    expect(out[29]).toBeCloseTo(1);
  });
});

describe('stochastic', () => {
  it('%K is 100 at the top and 0 at the bottom of the range', () => {
    const highs = [2, 3, 4, 5, 6];
    const lows = [1, 1, 1, 1, 1];
    expect(stochastic(highs, lows, [2, 3, 4, 5, 6], 3, 3).k[4]).toBeCloseTo(
      100
    );
    expect(stochastic(highs, lows, [1, 1, 1, 1, 1], 3, 3).k[4]).toBeCloseTo(0);
  });
});

describe('vwap', () => {
  it('is volume-weighted', () => {
    // typical 10 (vol 1) and 20 (vol 3) -> (10 + 60) / 4 = 17.5
    expect(vwap([10, 20], [10, 20], [10, 20], [1, 3])[1]).toBeCloseTo(17.5);
  });
});
