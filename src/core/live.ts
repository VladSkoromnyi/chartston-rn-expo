/**
 * Live-update application (PLAN §5.2, TECH_PLAN C.3). Pure & Node-testable.
 *
 * - {@link applyUpdates} folds a frame's worth of queued feed updates into the
 *   columns in ONE pass (≤ one repaint per frame, however fast the feed ticks).
 * - {@link mergeRecent} reconciles a REST page fetched after a reconnect: it
 *   inserts the bars missed while the socket was down — even when live bars have
 *   already been appended past the gap — by merging on `time`.
 */

import type { Candle, CandleUpdate, Interval } from '../types';
import { candlesToColumns } from './columns';
import type { CandleColumns } from './columns';
import { nextBarOpen } from './interval';

export interface ApplyResult {
  cols: CandleColumns;
  /** New bars appended past the previous last bar. */
  appended: number;
  /** A `snapshot` replaced the data (the view should re-fit). */
  replaced: boolean;
  /** Nothing changed (every update was out of order) — skip the re-render. */
  unchanged: boolean;
}

const KEYS = ['times', 'opens', 'highs', 'lows', 'closes', 'volumes'] as const;

function writeBar(c: CandleColumns, i: number, bar: Candle): void {
  c.times[i] = bar.time;
  c.opens[i] = bar.open;
  c.highs[i] = bar.high;
  c.lows[i] = bar.low;
  c.closes[i] = bar.close;
  c.volumes[i] = bar.volume ?? 0;
}

/**
 * Apply queued updates in order with the time-keyed contract: a bar whose time
 * equals the last bar patches it, a newer one appends, an older one is dropped.
 * (`append`/`patch` from the feed is advisory — only `time` decides.)
 *
 * The column ARRAYS are written in place (O(1) per tick instead of copying six
 * n-length arrays every frame — the M5 stress profile), and a changed result
 * comes back as a NEW wrapper object so React still sees the change. Anything
 * that needs the old length must remember it (see `markColumns`).
 */
export function applyUpdates(
  cols: CandleColumns,
  updates: readonly CandleUpdate[]
): ApplyResult {
  let out = cols;
  let appended = 0;
  let replaced = false;
  let changed = false;
  for (const u of updates) {
    if (u.type === 'snapshot') {
      out = candlesToColumns(u.candles);
      replaced = true;
      changed = true;
      appended = 0;
      continue;
    }
    const n = out.times.length;
    const last = n > 0 ? out.times[n - 1]! : -Infinity;
    const t = u.candle.time;
    if (t < last) continue; // out of order — dropped
    if (t === last) {
      writeBar(out, n - 1, u.candle);
    } else {
      writeBar(out, n, u.candle);
      appended += 1;
    }
    changed = true;
  }
  return {
    cols: changed && out === cols ? { ...cols } : out,
    appended,
    replaced,
    unchanged: !changed,
  };
}

export interface MergeResult {
  cols: CandleColumns;
  /**
   * `merge`: missed bars were inserted and/or loaded bars corrected. `replace`: the page doesn't reach back to
   * the loaded data (the outage outlasted one page) — the result is the page plus
   * any live bars newer than it, and the view should re-fit. `noop`: nothing new.
   */
  mode: 'merge' | 'replace' | 'noop';
  /** Indices (in the result) of bars that were inserted, ascending. */
  insertedAt: number[];
}

/**
 * Merge a freshly fetched page of the most recent bars into `cols` by `time`.
 * Bars older than the first loaded bar are ignored (paging backwards is lazy
 * history's job). For a time present in both, the REST bar wins — except the
 * current last bar, which the live stream keeps fresher.
 */
export function mergeRecent(
  cols: CandleColumns,
  recent: readonly Candle[],
  interval: Interval
): MergeResult {
  const n = cols.times.length;
  if (recent.length === 0) return { cols, mode: 'noop', insertedAt: [] };
  if (n === 0) {
    return {
      cols: candlesToColumns([...recent]),
      mode: 'replace',
      insertedAt: [],
    };
  }

  const first = cols.times[0]!;
  const lastTime = cols.times[n - 1]!;
  const page = recent.filter((c) => c.time >= first);

  // Gap check: the page must start at or before the bar right after our last
  // loaded *contiguous* bar, i.e. reach back into the data we already have.
  // (Live bars appended after the reconnect may sit past the gap, so find the
  // last loaded bar the page doesn't cover and require continuity from it.)
  const pageStart = page.length > 0 ? page[0]!.time : Infinity;
  let anchor = n - 1;
  while (anchor > 0 && cols.times[anchor]! >= pageStart) anchor -= 1;
  const anchorTime = cols.times[anchor]!;
  if (
    page.length === 0 ||
    (pageStart > anchorTime && pageStart > nextBarOpen(anchorTime, interval))
  ) {
    // Outage longer than one page: start over from the page, keeping live bars
    // that are newer than it.
    const pageLast = recent[recent.length - 1]!.time;
    const tail: Candle[] = [];
    for (let i = 0; i < n; i++) {
      if (cols.times[i]! > pageLast) {
        tail.push({
          time: cols.times[i]!,
          open: cols.opens[i]!,
          high: cols.highs[i]!,
          low: cols.lows[i]!,
          close: cols.closes[i]!,
          volume: cols.volumes[i]!,
        });
      }
    }
    return {
      cols: candlesToColumns([...recent, ...tail]),
      mode: 'replace',
      insertedAt: [],
    };
  }

  // Two-pointer merge of two time-sorted sequences.
  const out: CandleColumns = {
    times: [],
    opens: [],
    highs: [],
    lows: [],
    closes: [],
    volumes: [],
  };
  const insertedAt: number[] = [];
  let corrected = false;
  let i = 0;
  let j = 0;
  const pushOld = (k: number) => {
    for (const key of KEYS) out[key].push(cols[key][k]!);
  };
  const pushNew = (c: Candle) => writeBar(out, out.times.length, c);
  while (i < n || j < page.length) {
    const ti = i < n ? cols.times[i]! : Infinity;
    const tj = j < page.length ? page[j]!.time : Infinity;
    if (ti < tj) {
      pushOld(i++);
    } else if (tj < ti) {
      insertedAt.push(out.times.length);
      pushNew(page[j++]!);
    } else {
      // Same bar: REST is authoritative for closed bars (e.g. the bar that was
      // live when the socket dropped gets its final values); keep the live last bar.
      const c = page[j]!;
      if (ti === lastTime) {
        pushOld(i);
      } else {
        if (
          c.open !== cols.opens[i] ||
          c.high !== cols.highs[i] ||
          c.low !== cols.lows[i] ||
          c.close !== cols.closes[i] ||
          (c.volume ?? 0) !== cols.volumes[i]
        ) {
          corrected = true;
        }
        pushNew(c);
      }
      i++;
      j++;
    }
  }
  return {
    cols: out,
    mode: insertedAt.length > 0 || corrected ? 'merge' : 'noop',
    insertedAt,
  };
}
