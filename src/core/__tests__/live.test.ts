import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { candlesToColumns } from '../columns';
import type { CandleColumns } from '../columns';
import { applyUpdates, mergeRecent } from '../live';
import { normalizeBinanceKline } from '../../stream/adapters/binance';
import type { BinanceKline } from '../../stream/adapters/binance';
import type { Candle, CandleUpdate } from '../../types';

const M = 60_000;
const T0 = 1_730_000_040_000;

/**
 * Synthetic WS frames in Binance's kline format (not a live recording): ticks,
 * a duplicate, a late stale frame, then a drop that loses bars 2–5 before live
 * resumes in bar 6. Normalized exactly as the adapter does.
 */
const replay: CandleUpdate[] = readFileSync(
  join(__dirname, '../__fixtures__/binance-btcusdt-1m-replay.jsonl'),
  'utf8'
)
  .trim()
  .split('\n')
  .map((line) => (JSON.parse(line) as { k: BinanceKline }).k)
  .map((k) => ({ type: 'patch', candle: normalizeBinanceKline(k) }));

const bar = (
  i: number,
  close: number,
  extra: Partial<Candle> = {}
): Candle => ({
  time: T0 + i * M,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
  ...extra,
});

/** Columns → Candle[] for readable assertions. */
const rows = (c: CandleColumns): Candle[] =>
  c.times.map((time, i) => ({
    time,
    open: c.opens[i]!,
    high: c.highs[i]!,
    low: c.lows[i]!,
    close: c.closes[i]!,
    volume: c.volumes[i]!,
  }));

const empty = () => candlesToColumns([]);

describe('applyUpdates — replayed Binance stream', () => {
  const oneByOne = replay.reduce(
    (cols, u) => applyUpdates(cols, [u]).cols,
    empty()
  );

  it('keeps one bar per open time, final values win, stale frame dropped', () => {
    expect(rows(oneByOne).map((b) => (b.time - T0) / M)).toEqual([0, 1, 2, 6]);
    expect(rows(oneByOne)[0]).toMatchObject({
      close: 100.8,
      high: 101,
      low: 99.5,
    });
    expect(rows(oneByOne)[1]).toMatchObject({ close: 101.5, volume: 0.9 });
    expect(rows(oneByOne)[3]).toMatchObject({ close: 103.3, high: 103.4 });
  });

  it('is batch-invariant: any frame grouping yields the same columns', () => {
    for (const size of [2, 3, 5, replay.length]) {
      let cols = empty();
      for (let i = 0; i < replay.length; i += size) {
        cols = applyUpdates(cols, replay.slice(i, i + size)).cols;
      }
      expect(cols).toEqual(oneByOne);
    }
  });

  it('reports appends per batch; grows the arrays in place under a new wrapper', () => {
    const before = candlesToColumns([bar(0, 1)]);
    const r = applyUpdates(before, [
      { type: 'patch', candle: bar(0, 2) },
      { type: 'append', candle: bar(1, 3) },
      { type: 'patch', candle: bar(2, 4) }, // `type` is advisory — time decides
    ]);
    expect(r.appended).toBe(2);
    expect(r.cols.closes).toEqual([2, 3, 4]);
    expect(r.cols).not.toBe(before); // React sees a change…
    expect(r.cols.closes).toBe(before.closes); // …without an O(n) copy
  });

  it('flags a batch of only out-of-order frames as unchanged', () => {
    const cols = candlesToColumns([bar(0, 1), bar(1, 2)]);
    const r = applyUpdates(cols, [{ type: 'patch', candle: bar(0, 9) }]);
    expect(r.unchanged).toBe(true);
    expect(r.cols).toBe(cols);
  });

  it('a snapshot mid-batch replaces, later frames apply on top', () => {
    const r = applyUpdates(candlesToColumns([bar(0, 1)]), [
      { type: 'append', candle: bar(1, 2) },
      { type: 'snapshot', candles: [bar(10, 5), bar(11, 6)] },
      { type: 'patch', candle: bar(11, 7) },
    ]);
    expect(r.replaced).toBe(true);
    expect(r.appended).toBe(0);
    expect(r.cols.closes).toEqual([5, 7]);
  });
});

describe('mergeRecent — reconnect gap fill', () => {
  // State after the replay: bars 0,1,2 then live bar 6 (2 is a stale mid-bar tick).
  const live = applyUpdates(empty(), replay).cols;
  // What REST returns on reopen: bars 0..6 with bar 2 final.
  const page = [
    bar(0, 100.8),
    bar(1, 101.5),
    bar(2, 101.9, { high: 102 }),
    bar(3, 102.2),
    bar(4, 102.6),
    bar(5, 102.9),
    bar(6, 103.0),
  ];

  it('inserts the missed bars between loaded and live bars', () => {
    const m = mergeRecent(live, page, '1m');
    expect(m.mode).toBe('merge');
    expect(rows(m.cols).map((b) => (b.time - T0) / M)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(m.insertedAt).toEqual([3, 4, 5]);
  });

  it('REST corrects closed bars, the live last bar keeps its fresher tick', () => {
    const m = mergeRecent(live, page, '1m');
    expect(rows(m.cols)[2]).toMatchObject({ close: 101.9, high: 102 });
    expect(rows(m.cols)[6]).toMatchObject({ close: 103.3 });
  });

  it('is a noop when nothing was missed', () => {
    const cols = candlesToColumns([bar(0, 1), bar(1, 2)]);
    expect(mergeRecent(cols, [bar(0, 1), bar(1, 2)], '1m').mode).toBe('noop');
  });

  it('corrects a bar even with nothing to insert (final value of the dropped bar)', () => {
    const cols = candlesToColumns([bar(0, 1), bar(1, 2), bar(2, 3)]);
    const m = mergeRecent(cols, [bar(0, 1), bar(1, 2.5), bar(2, 3)], '1m');
    expect(m.mode).toBe('merge');
    expect(m.insertedAt).toEqual([]);
    expect(m.cols.closes).toEqual([1, 2.5, 3]);
  });

  it('replaces when the outage outlasted a page, keeping newer live bars', () => {
    const cols = candlesToColumns([bar(0, 1), bar(1, 2), bar(50, 9)]);
    const m = mergeRecent(cols, [bar(40, 7), bar(41, 8)], '1m');
    expect(m.mode).toBe('replace');
    expect(rows(m.cols).map((b) => (b.time - T0) / M)).toEqual([40, 41, 50]);
  });

  it('ignores page bars older than the loaded data (lazy history owns that)', () => {
    const cols = candlesToColumns([bar(5, 1), bar(6, 2)]);
    const m = mergeRecent(
      cols,
      [bar(3, 0), bar(4, 0), bar(5, 1), bar(6, 2), bar(7, 3)],
      '1m'
    );
    expect(rows(m.cols).map((b) => (b.time - T0) / M)).toEqual([5, 6, 7]);
  });
});
