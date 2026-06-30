/**
 * Candle column working-set (PLAN §5.2, RESEARCH §4). Plain number arrays — the
 * shape the renderer and live-update path operate on. Pure & Node-testable.
 *
 * NOTE (Stage 4 follow-up): live updates currently return NEW arrays (immutable,
 * React-friendly). The ring-buffer optimization — fixed-capacity persistent typed
 * arrays with O(1) append/patch and bounded memory — is the planned refinement;
 * the {@link CandleColumns} shape stays the same so callers are insulated.
 */

import type { Candle } from '../types';

export interface CandleColumns {
  times: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

export function candlesToColumns(candles: Candle[]): CandleColumns {
  const n = candles.length;
  const times = new Array<number>(n);
  const opens = new Array<number>(n);
  const highs = new Array<number>(n);
  const lows = new Array<number>(n);
  const closes = new Array<number>(n);
  const volumes = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    times[i] = c.time;
    opens[i] = c.open;
    highs[i] = c.high;
    lows[i] = c.low;
    closes[i] = c.close;
    volumes[i] = c.volume ?? 0;
  }
  return { times, opens, highs, lows, closes, volumes };
}

/**
 * Apply one live update, returning NEW column arrays (immutable for React):
 *   - `patch`  → replace the last bar in place (the active candle ticking)
 *   - `append` → push a new bar
 *
 * The caller decides patch vs append; the feed emits well-typed updates and the
 * stream engine (Stage 5) dedupes by time before emitting.
 */
export function ingestColumns(
  cols: CandleColumns,
  type: 'append' | 'patch',
  c: Candle
): CandleColumns {
  const n = cols.times.length;
  if (type === 'patch' && n > 0) {
    const repl = (arr: number[], v: number): number[] => {
      const a = arr.slice();
      a[n - 1] = v;
      return a;
    };
    return {
      times: cols.times,
      opens: repl(cols.opens, c.open),
      highs: repl(cols.highs, c.high),
      lows: repl(cols.lows, c.low),
      closes: repl(cols.closes, c.close),
      volumes: repl(cols.volumes, c.volume ?? 0),
    };
  }
  return {
    times: [...cols.times, c.time],
    opens: [...cols.opens, c.open],
    highs: [...cols.highs, c.high],
    lows: [...cols.lows, c.low],
    closes: [...cols.closes, c.close],
    volumes: [...cols.volumes, c.volume ?? 0],
  };
}

/**
 * Prepend OLDER candles to the front (lazy history loading). Bars whose time is at
 * or after the current first bar are dropped (seam dedup), so the result stays
 * sorted and gap/overlap-free. Returns NEW arrays (immutable for React). Assumes
 * `older` is ascending.
 */
export function prependColumns(
  cols: CandleColumns,
  older: Candle[]
): CandleColumns {
  const firstTime = cols.times.length > 0 ? cols.times[0]! : Infinity;
  const fresh = older.filter((c) => c.time < firstTime);
  if (fresh.length === 0) return cols;
  const head = candlesToColumns(fresh);
  return {
    times: [...head.times, ...cols.times],
    opens: [...head.opens, ...cols.opens],
    highs: [...head.highs, ...cols.highs],
    lows: [...head.lows, ...cols.lows],
    closes: [...head.closes, ...cols.closes],
    volumes: [...head.volumes, ...cols.volumes],
  };
}
