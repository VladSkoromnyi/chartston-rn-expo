import { describe, expect, it } from 'vitest';
import { candlesToColumns, ingestColumns, prependColumns } from '../columns';
import type { Candle } from '../../types';

const bar = (time: number, close = 1.5, volume = 10): Candle => ({
  time,
  open: 1,
  high: 3,
  low: 0.5,
  close,
  volume,
});

describe('candle columns — backfill↔live merge contract', () => {
  it('candlesToColumns maps OHLCV and defaults a missing volume to 0', () => {
    const cols = candlesToColumns([
      bar(1000),
      { time: 2000, open: 1, high: 2, low: 0, close: 1 }, // volume omitted
    ]);
    expect(cols.times).toEqual([1000, 2000]);
    expect(cols.closes).toEqual([1.5, 1]);
    expect(cols.volumes).toEqual([10, 0]);
  });

  it('append adds a new bar and returns fresh arrays (immutable)', () => {
    const a = candlesToColumns([bar(1000)]);
    const b = ingestColumns(a, 'append', bar(2000, 1.7, 5));
    expect(b.times).toEqual([1000, 2000]);
    expect(b.closes).toEqual([1.5, 1.7]);
    expect(b.volumes[1]).toBe(5);
    // original is untouched, and a new array identity is returned
    expect(a.times).toEqual([1000]);
    expect(b.times).not.toBe(a.times);
  });

  it('patch replaces the last bar without changing length', () => {
    const a = candlesToColumns([bar(1000), bar(2000, 1.5, 10)]);
    const b = ingestColumns(a, 'patch', {
      ...bar(2000),
      high: 9,
      close: 2.2,
      volume: 25,
    });
    expect(b.times).toEqual([1000, 2000]); // same length + same times
    expect(b.times).toBe(a.times); // times array is reused on patch
    expect(b.closes).toEqual([1.5, 2.2]);
    expect(b.highs[1]).toBe(9);
    expect(b.volumes[1]).toBe(25);
    // the source's last bar is not mutated
    expect(a.closes[1]).toBe(1.5);
    expect(b.closes).not.toBe(a.closes);
  });

  it('patch on empty columns falls through to append', () => {
    const b = ingestColumns(candlesToColumns([]), 'patch', bar(1000));
    expect(b.times).toEqual([1000]);
    expect(b.closes).toEqual([1.5]);
  });
});

describe('prependColumns — lazy history paging', () => {
  it('prepends older bars to the front, preserving order', () => {
    const cur = candlesToColumns([bar(3000, 3), bar(4000, 4)]);
    const out = prependColumns(cur, [bar(1000, 1), bar(2000, 2)]);
    expect(out.times).toEqual([1000, 2000, 3000, 4000]);
    expect(out.closes).toEqual([1, 2, 3, 4]);
    // immutable: source untouched, fresh array identity
    expect(cur.times).toEqual([3000, 4000]);
    expect(out.times).not.toBe(cur.times);
  });

  it('drops bars at/after the current first bar (seam dedup)', () => {
    const cur = candlesToColumns([bar(3000, 3), bar(4000, 4)]);
    // 3000 overlaps the seam and 5000 is newer — both dropped; only 2000 kept
    const out = prependColumns(cur, [bar(2000, 2), bar(3000, 9), bar(5000, 9)]);
    expect(out.times).toEqual([2000, 3000, 4000]);
    expect(out.closes).toEqual([2, 3, 4]); // existing 3000 keeps close 3, not 9
  });

  it('returns the same columns when there is nothing older to add', () => {
    const cur = candlesToColumns([bar(3000, 3)]);
    expect(prependColumns(cur, [])).toBe(cur);
    expect(prependColumns(cur, [bar(3000, 9), bar(4000, 9)])).toBe(cur);
  });

  it('prepends onto empty columns', () => {
    const out = prependColumns(candlesToColumns([]), [
      bar(1000, 1),
      bar(2000, 2),
    ]);
    expect(out.times).toEqual([1000, 2000]);
  });
});
