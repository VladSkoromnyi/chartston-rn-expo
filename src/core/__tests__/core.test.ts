import { describe, expect, it } from 'vitest';
import {
  indexToCenterX,
  indexToX,
  priceToY,
  xToIndex,
  yToPrice,
} from '../coords';
import { floorToInterval, intervalToMs, nextBarOpen } from '../interval';
import { niceTicks } from '../ticks';
import { candlesToColumns, ingestColumns } from '../columns';
import { CandleStore } from '../candle-store';
import { autoScale } from '../autoscale';
import type { Candle, Viewport } from '../../types';

const vp: Viewport = {
  offset: 10,
  barSpacing: 8,
  rightPadding: 0,
  pinnedToNow: true,
  logScale: false,
};

describe('coords (inverses)', () => {
  it('xToIndex inverts indexToX', () => {
    expect(xToIndex(indexToX(42, vp), vp)).toBeCloseTo(42);
  });
  it('yToPrice inverts priceToY (linear)', () => {
    const range = { min: 100, max: 200 };
    expect(yToPrice(priceToY(150, range, 400), range, 400)).toBeCloseTo(150);
  });
  it('yToPrice inverts priceToY (log)', () => {
    const range = { min: 100, max: 200 };
    expect(
      yToPrice(priceToY(150, range, 400, true), range, 400, true)
    ).toBeCloseTo(150);
  });
  it('center x is half a bar right of the left edge', () => {
    expect(indexToCenterX(5, vp)).toBeCloseTo(
      indexToX(5, vp) + vp.barSpacing / 2
    );
  });
});

describe('interval math', () => {
  it('intervalToMs', () => {
    expect(intervalToMs('1m')).toBe(60_000);
    expect(intervalToMs('1h')).toBe(3_600_000);
  });
  it('floors minutes', () => {
    const t = Date.UTC(2026, 0, 1, 12, 34, 56);
    expect(floorToInterval(t, '1m')).toBe(Date.UTC(2026, 0, 1, 12, 34, 0));
  });
  it('floors 1M to the month start (UTC)', () => {
    expect(floorToInterval(Date.UTC(2026, 5, 15, 8), '1M')).toBe(
      Date.UTC(2026, 5, 1)
    );
  });
  it('floors 1w to a Monday (UTC) at or before t', () => {
    const t = Date.UTC(2026, 0, 1); // Thursday
    const f = floorToInterval(t, '1w');
    expect(new Date(f).getUTCDay()).toBe(1);
    expect(f).toBeLessThanOrEqual(t);
  });
  it('nextBarOpen advances one interval', () => {
    expect(nextBarOpen(Date.UTC(2026, 0, 1, 12), '1h')).toBe(
      Date.UTC(2026, 0, 1, 13)
    );
  });
});

describe('niceTicks', () => {
  it('stays within range', () => {
    const ticks = niceTicks(0, 100, 5);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100 + 1e-6);
    }
  });
});

const candles: Candle[] = [
  { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: 2, open: 1.5, high: 2.5, low: 1, close: 2, volume: 20 },
];

describe('columns', () => {
  it('maps fields', () => {
    const cols = candlesToColumns(candles);
    expect(cols.closes).toEqual([1.5, 2]);
    expect(cols.volumes).toEqual([10, 20]);
  });
  it('patch replaces the last bar', () => {
    const next = ingestColumns(candlesToColumns(candles), 'patch', {
      time: 2,
      open: 1.5,
      high: 3,
      low: 1,
      close: 2.8,
      volume: 25,
    });
    expect(next.closes).toEqual([1.5, 2.8]);
    expect(next.times.length).toBe(2);
  });
  it('append pushes a bar', () => {
    const next = ingestColumns(candlesToColumns(candles), 'append', {
      time: 3,
      open: 2,
      high: 2.2,
      low: 1.9,
      close: 2.1,
      volume: 5,
    });
    expect(next.times).toEqual([1, 2, 3]);
    expect(next.closes[2]).toBe(2.1);
  });
});

describe('CandleStore (time-keyed)', () => {
  it('snapshot / patch / append / out-of-order', () => {
    const store = new CandleStore();
    expect(store.apply({ type: 'snapshot', candles })).toBe('snapshot');
    expect(
      store.apply({
        type: 'patch',
        candle: { time: 2, open: 1.5, high: 3, low: 1, close: 2.9, volume: 30 },
      })
    ).toBe('patch');
    expect(store.length).toBe(2);
    expect(
      store.apply({
        type: 'append',
        candle: {
          time: 3,
          open: 2.9,
          high: 3,
          low: 2.8,
          close: 2.95,
          volume: 1,
        },
      })
    ).toBe('append');
    expect(store.length).toBe(3);
    expect(
      store.apply({
        type: 'append',
        candle: { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      })
    ).toBe('noop');
  });
});

describe('autoScale', () => {
  it('pads the visible high/low', () => {
    const store = new CandleStore();
    store.apply({ type: 'snapshot', candles });
    const range = autoScale(store.view(), 0, 1, 0.1);
    expect(range.min).toBeLessThan(0.5);
    expect(range.max).toBeGreaterThan(2.5);
  });
});
