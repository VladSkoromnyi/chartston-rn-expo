import { afterEach, describe, expect, it, vi } from 'vitest';
import { padRange } from '../autoscale';
import { candlesToColumns, ingestColumns, prependColumns } from '../columns';
import { formatAxisValue } from '../format';
import {
  columnsToView,
  runStudies,
  seriesExtent,
  markColumns,
  studyNeedsReset,
} from '../studies';
import { throttleTrailing } from '../throttle';
import { toViewport } from '../viewport';
import type {
  Candle,
  CandleView,
  StudyDescriptor,
  StudyState,
} from '../../types';

const bar = (i: number, close = 100 + i): Candle => ({
  time: 1_000 * i,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 10,
});
const bars = (from: number, to: number): Candle[] =>
  Array.from({ length: to - from }, (_, k) => bar(from + k));

describe('padRange', () => {
  it('pads linearly by 10% of the span', () => {
    expect(padRange(100, 200, false)).toEqual({ min: 90, max: 210 });
  });
  it('pads in log space (equal log margins, min stays > 0)', () => {
    const r = padRange(10, 1000, true);
    expect(Math.log(10) - Math.log(r.min)).toBeCloseTo(
      Math.log(r.max) - Math.log(1000)
    );
    expect(r.min).toBeGreaterThan(0);
  });
  it('falls back to linear when log is asked for a non-positive band', () => {
    expect(padRange(-5, 5, true)).toEqual(padRange(-5, 5, false));
  });
  it('widens a flat band', () => {
    const r = padRange(50, 50, true);
    expect(r.min).toBeLessThan(50);
    expect(r.max).toBeGreaterThan(50);
  });
});

describe('toViewport', () => {
  it('is pinned when the newest bar is on screen', () => {
    // 100 bars, 40 visible from offset 60 → last index 99 within view.
    expect(toViewport(60, 8, 320, 100, false).pinnedToNow).toBe(true);
  });
  it('is not pinned after panning back', () => {
    expect(toViewport(10, 8, 320, 100, true)).toMatchObject({
      offset: 10,
      barSpacing: 8,
      pinnedToNow: false,
      logScale: true,
    });
  });
});

describe('throttleTrailing', () => {
  afterEach(() => vi.useRealTimers());

  it('fires leading, coalesces the window, then delivers the latest value', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const t = throttleTrailing<number>((v) => seen.push(v), 100);
    t.call(1);
    t.call(2);
    t.call(3);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([1, 3]);
    vi.advanceTimersByTime(500);
    t.call(4); // window long closed → immediate
    expect(seen).toEqual([1, 3, 4]);
  });
  it('cancel drops the pending trailing call', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const t = throttleTrailing<number>((v) => seen.push(v), 100);
    t.call(1);
    t.call(2);
    t.cancel();
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([1]);
  });
});

describe('formatAxisValue', () => {
  it('keeps small values readable', () => {
    expect(formatAxisValue(0.0042)).toBe('0.00420');
    expect(formatAxisValue(-3.14159)).toBe('-3.14');
    expect(formatAxisValue(0)).toBe('0');
    expect(formatAxisValue(12_345)).toBe('12.35K');
  });
});

describe('studyNeedsReset', () => {
  const base = candlesToColumns(bars(0, 5));
  it('resets without previous data', () => {
    expect(studyNeedsReset(null, base)).toBe(true);
  });
  it('continues across a live patch or append', () => {
    expect(
      studyNeedsReset(
        markColumns(base),
        ingestColumns(base, 'patch', bar(4, 1))
      )
    ).toBe(false);
    expect(
      studyNeedsReset(markColumns(base), ingestColumns(base, 'append', bar(5)))
    ).toBe(false);
  });
  it('resets when history is prepended or replaced', () => {
    expect(
      studyNeedsReset(markColumns(base), prependColumns(base, bars(-3, 0)))
    ).toBe(true);
    expect(
      studyNeedsReset(markColumns(base), candlesToColumns(bars(10, 20)))
    ).toBe(true);
    expect(
      studyNeedsReset(markColumns(base), candlesToColumns(bars(0, 3)))
    ).toBe(true);
  });
});

/** Incremental running-sum study: recomputes only from `prev.lastIndex`. */
function sumStudy(calls: { from: number }[]): StudyDescriptor {
  return {
    id: 'sum',
    kind: 'pane',
    name: 'Sum',
    inputs: {},
    compute(c: CandleView, prev?: StudyState): StudyState {
      const out = new Float64Array(c.length);
      const from = prev ? prev.lastIndex : 0;
      if (prev) out.set(prev.series.sum!.subarray(0, from));
      for (let i = from; i < c.length; i++) {
        out[i] = (i > 0 ? out[i - 1]! : 0) + c.closes[i]!;
      }
      calls.push({ from });
      return { series: { sum: out }, scratch: {}, lastIndex: c.length - 1 };
    },
    draw() {},
  };
}

describe('runStudies', () => {
  it('passes prev state while data continues, none after a reset', () => {
    const calls: { from: number }[] = [];
    const d = sumStudy(calls);
    const a = candlesToColumns(bars(0, 3));
    const r1 = runStudies([d], columnsToView(a), null, true);
    const b = ingestColumns(a, 'patch', bar(2, 1));
    const r2 = runStudies(
      [d],
      columnsToView(b),
      r1,
      studyNeedsReset(markColumns(a), b)
    );
    expect(calls.map((c) => c.from)).toEqual([0, 2]);
    // 100 + 101 + 1 (patched last close)
    expect(r2.get('sum')!.state.series.sum![2]).toBe(202);
    runStudies([d], columnsToView(b), r2, true);
    expect(calls[2]!.from).toBe(0);
  });
  it('starts a swapped descriptor fresh and skips one that throws', () => {
    const calls: { from: number }[] = [];
    const cols = columnsToView(candlesToColumns(bars(0, 3)));
    const r1 = runStudies([sumStudy(calls)], cols, null, true);
    const boom: StudyDescriptor = {
      ...sumStudy(calls),
      id: 'boom',
      compute: () => {
        throw new Error('consumer bug');
      },
    };
    const r2 = runStudies([sumStudy(calls), boom], cols, r1, false);
    expect(calls.map((c) => c.from)).toEqual([0, 0]);
    expect([...r2.keys()]).toEqual(['sum']);
  });
});

describe('seriesExtent', () => {
  it('spans finite values of every series inside the window', () => {
    const state: StudyState = {
      series: {
        a: Float64Array.from([NaN, 5, -2, 100]),
        b: Float64Array.from([NaN, 7, NaN, -50]),
      },
      scratch: {},
      lastIndex: 3,
    };
    expect(seriesExtent(state, 0, 2)).toEqual({ min: -2, max: 7 });
    expect(seriesExtent(state, 0, 0)).toBeNull();
  });
});
