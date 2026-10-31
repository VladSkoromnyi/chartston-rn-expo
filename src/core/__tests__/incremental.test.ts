import { describe, expect, it } from 'vitest';
import { candlesToColumns, prependColumns } from '../columns';
import type { CandleColumns } from '../columns';
import { applyUpdates } from '../live';
import {
  BuiltinStudies,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  vwap,
} from '../indicators';
import type { BuiltinSeries } from '../indicators';
import type { Candle } from '../../types';

const M = 60_000;
// Starts 3 hours before a UTC midnight, so VWAP's daily reset is exercised.
const T0 = Date.UTC(2026, 9, 30, 21);

function walk(n: number, from = 0, seed = 42): Candle[] {
  let s = seed;
  const rand = () => {
    s = (s * 48_271) % 2_147_483_647;
    return s / 2_147_483_647;
  };
  let price = 100;
  return Array.from({ length: n }, (_, k) => {
    const open = price;
    const close = Math.max(1, open + (rand() - 0.5) * 2);
    price = close;
    return {
      time: T0 + (from + k) * M,
      open,
      high: Math.max(open, close) + rand(),
      low: Math.min(open, close) - rand(),
      close,
      volume: 1 + rand() * 10,
    };
  });
}

/** The full-recompute reference, shaped like BuiltinSeries. */
function reference(c: CandleColumns): BuiltinSeries {
  return {
    sma20: sma(c.closes, 20),
    ema50: ema(c.closes, 50),
    bollinger: bollinger(c.closes, 20, 2),
    vwap: vwap(c.highs, c.lows, c.closes, c.volumes, c.times),
    rsi14: rsi(c.closes, 14),
    macd: macd(c.closes, 12, 26, 9),
  };
}

function expectSeriesClose(actual: number[], expected: number[]) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i]!;
    const a = actual[i]!;
    if (Number.isNaN(e)) expect(a, `index ${i}`).toBeNaN();
    else
      expect(Math.abs(a - e), `index ${i}`).toBeLessThan(
        1e-9 * Math.max(1, Math.abs(e))
      );
  }
}

function expectMatchesReference(s: BuiltinSeries, c: CandleColumns) {
  const r = reference(c);
  expectSeriesClose(s.sma20, r.sma20);
  expectSeriesClose(s.ema50, r.ema50);
  expectSeriesClose(s.bollinger.middle, r.bollinger.middle);
  expectSeriesClose(s.bollinger.upper, r.bollinger.upper);
  expectSeriesClose(s.bollinger.lower, r.bollinger.lower);
  expectSeriesClose(s.vwap, r.vwap);
  expectSeriesClose(s.rsi14, r.rsi14);
  expectSeriesClose(s.macd.macd, r.macd.macd);
  expectSeriesClose(s.macd.signal, r.macd.signal);
  expectSeriesClose(s.macd.histogram, r.macd.histogram);
}

describe('BuiltinStudies (incremental) matches the full calculators', () => {
  it('on a full build, including warm-up indices', () => {
    const c = candlesToColumns(walk(300));
    expectMatchesReference(new BuiltinStudies().update(c), c);
  });

  it('after a stream of live patches and appends (arrays grown in place)', () => {
    const engine = new BuiltinStudies();
    let c = candlesToColumns(walk(120));
    engine.update(c);
    const live = walk(400, 120, 7);
    let s = 7;
    for (const next of live) {
      // A few patches of the active bar, then the bar rolls over.
      for (let p = 0; p < 3; p++) {
        s = (s * 48_271) % 2_147_483_647;
        const last = c.times.length - 1;
        const close = c.closes[last]! + (s / 2_147_483_647 - 0.5);
        c = applyUpdates(c, [
          {
            type: 'patch',
            candle: {
              time: c.times[last]!,
              open: c.opens[last]!,
              high: Math.max(c.highs[last]!, close),
              low: Math.min(c.lows[last]!, close),
              close,
              volume: c.volumes[last]! + 1,
            },
          },
        ]).cols;
        engine.update(c);
      }
      c = applyUpdates(c, [{ type: 'append', candle: next }]).cols;
      engine.update(c);
    }
    expectMatchesReference(engine.update(c), c);
  });

  it('several appends between updates (a coalesced frame)', () => {
    const engine = new BuiltinStudies();
    let c = candlesToColumns(walk(60));
    engine.update(c);
    const more = walk(5, 60, 9).map((candle) => ({
      type: 'append' as const,
      candle,
    }));
    c = applyUpdates(c, more).cols;
    expectMatchesReference(engine.update(c), c);
  });

  it('starts over after older history is prepended', () => {
    const engine = new BuiltinStudies();
    let c = candlesToColumns(walk(200, 100));
    engine.update(c);
    c = prependColumns(c, walk(100, 0, 3));
    expectMatchesReference(engine.update(c), c);
  });

  it('returns a new object each update (memoized consumers re-render)', () => {
    const engine = new BuiltinStudies();
    const c = candlesToColumns(walk(30));
    expect(engine.update(c)).not.toBe(engine.update(c));
  });
});
