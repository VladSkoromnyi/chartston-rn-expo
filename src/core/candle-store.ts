/**
 * Candle store — the core data structure (PLAN §5.2, RESEARCH §4).
 *
 * Implements the Lightweight Charts time-keyed contract:
 *   snapshot -> replace all; ingest(c) -> patch last if same time, append if newer,
 *   drop if older (out of order).
 *
 * NOTE (Stage 4): this is a correct-but-simple array-backed implementation that
 * rebuilds typed-array columns in `view()`. The performance refinement — a fixed
 * **ring buffer over persistent `Float64Array` columns** with O(1) append/patch and
 * no per-`view()` allocation — lands in Stage 4. The public `CandleView` shape does
 * not change, so callers are insulated.
 */

import type { Candle, CandleUpdate, CandleView } from '../types';

export type IngestResult = 'snapshot' | 'append' | 'patch' | 'noop';

export class CandleStore {
  private candles: Candle[] = [];

  get length(): number {
    return this.candles.length;
  }

  clear(): void {
    this.candles = [];
  }

  /** Apply a live update, returning what actually happened. */
  apply(update: CandleUpdate): IngestResult {
    switch (update.type) {
      case 'snapshot':
        this.candles = update.candles.slice();
        return 'snapshot';
      case 'append':
      case 'patch':
        return this.ingest(update.candle);
    }
  }

  /** Time-keyed single-bar ingest (the heart of the live contract). */
  private ingest(c: Candle): IngestResult {
    const n = this.candles.length;
    if (n === 0) {
      this.candles.push(c);
      return 'append';
    }
    const last = this.candles[n - 1]!;
    if (c.time === last.time) {
      this.candles[n - 1] = c;
      return 'patch';
    }
    if (c.time > last.time) {
      this.candles.push(c);
      return 'append';
    }
    return 'noop'; // older than the last bar — ignore (out of order)
  }

  /**
   * Build a read-only view. TODO(stage-4): keep persistent typed-array columns
   * so this is allocation-free instead of rebuilding every call.
   */
  view(): CandleView {
    const n = this.candles.length;
    const times = new Float64Array(n);
    const opens = new Float64Array(n);
    const highs = new Float64Array(n);
    const lows = new Float64Array(n);
    const closes = new Float64Array(n);
    const volumes = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = this.candles[i]!;
      times[i] = c.time;
      opens[i] = c.open;
      highs[i] = c.high;
      lows[i] = c.low;
      closes[i] = c.close;
      volumes[i] = c.volume ?? 0;
    }
    const candles = this.candles;
    return {
      length: n,
      at: (i: number): Candle => ({ ...candles[i]! }),
      timeAt: (i: number): number => candles[i]!.time,
      times,
      opens,
      highs,
      lows,
      closes,
      volumes,
    };
  }
}
