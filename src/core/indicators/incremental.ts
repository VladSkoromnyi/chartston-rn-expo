/**
 * Incremental built-in studies for `<Chart/>` (M5). Pure & Node-testable.
 *
 * The {@link calculators} recompute every index on every call — O(n) per study
 * per live tick, which dominated the JS thread at 10k+ bars. This engine keeps
 * each output (plus the per-index state the recursive studies need: EMA values,
 * Wilder RSI averages, VWAP session sums) and, while the data only ticks or
 * grows, recomputes just `[lastBar, end)`. A snapshot / switch / history
 * prepend shifts indices, so it starts over (see {@link studyNeedsReset}).
 *
 * Each index is computed with the same formulas as the calculators, so the
 * results match them (tests assert this; SMA differs only in float rounding,
 * since it sums the window directly instead of keeping a running sum).
 */

import type { CandleColumns } from '../columns';
import { markColumns, studyNeedsReset } from '../studies';
import type { ColumnsMark } from '../studies';

const NA = NaN;
const SESSION_MS = 86_400_000;

/** The built-in study outputs `<Chart/>` draws (aligned to candle indices). */
export interface BuiltinSeries {
  sma20: number[];
  ema50: number[];
  bollinger: { upper: number[]; lower: number[]; middle: number[] };
  vwap: number[];
  rsi14: number[];
  macd: { macd: number[]; signal: number[]; histogram: number[] };
}

/** Mean of `values[from..to]` (inclusive). */
function mean(values: number[], from: number, to: number): number {
  let s = 0;
  for (let j = from; j <= to; j++) s += values[j]!;
  return s / (to - from + 1);
}

/**
 * EMA at `i` given `out` filled below `i` — seeded with the SMA of the first
 * `period` defined values starting at `first` (as `ema` / MACD's signal do).
 */
function emaAt(
  values: number[],
  out: number[],
  period: number,
  i: number,
  first = 0
): number {
  const seedAt = first + period - 1;
  if (first < 0 || i < seedAt) return NA;
  if (i === seedAt) return mean(values, first, seedAt);
  const k = 2 / (period + 1);
  return values[i]! * k + out[i - 1]! * (1 - k);
}

export class BuiltinStudies {
  private mark: ColumnsMark | null = null;
  private s: BuiltinSeries = BuiltinStudies.empty();
  // Recursive state, aligned to indices.
  private emaFast: number[] = [];
  private emaSlow: number[] = [];
  private avgGain: number[] = [];
  private avgLoss: number[] = [];
  private cumPV: number[] = [];
  private cumV: number[] = [];

  private static empty(): BuiltinSeries {
    return {
      sma20: [],
      ema50: [],
      bollinger: { upper: [], lower: [], middle: [] },
      vwap: [],
      rsi14: [],
      macd: { macd: [], signal: [], histogram: [] },
    };
  }

  /**
   * Bring the series up to date with `cols` and return them. The returned object
   * is new on every call (so memoized consumers re-render); its arrays are
   * reused and extended in place.
   */
  update(cols: CandleColumns): BuiltinSeries {
    let from: number;
    if (studyNeedsReset(this.mark, cols)) {
      this.s = BuiltinStudies.empty();
      this.emaFast = [];
      this.emaSlow = [];
      this.avgGain = [];
      this.avgLoss = [];
      this.cumPV = [];
      this.cumV = [];
      from = 0;
    } else {
      // The previous last bar may have been patched — recompute from it.
      from = Math.max(0, this.mark!.length - 1);
    }
    for (let i = from; i < cols.times.length; i++) this.computeAt(cols, i);
    this.mark = markColumns(cols);
    const s = this.s;
    return {
      ...s,
      bollinger: { ...s.bollinger },
      macd: { ...s.macd },
    };
  }

  private computeAt(c: CandleColumns, i: number): void {
    const s = this.s;
    const closes = c.closes;

    // SMA 20 + Bollinger (20, 2σ, population std-dev) share the window.
    if (i >= 19) {
      const m = mean(closes, i - 19, i);
      let variance = 0;
      for (let j = i - 19; j <= i; j++) {
        const d = closes[j]! - m;
        variance += d * d;
      }
      const sd = Math.sqrt(variance / 20);
      s.sma20[i] = m;
      s.bollinger.middle[i] = m;
      s.bollinger.upper[i] = m + 2 * sd;
      s.bollinger.lower[i] = m - 2 * sd;
    } else {
      s.sma20[i] = NA;
      s.bollinger.middle[i] = NA;
      s.bollinger.upper[i] = NA;
      s.bollinger.lower[i] = NA;
    }

    // EMA 50.
    s.ema50[i] = emaAt(closes, s.ema50, 50, i);

    // RSI 14 (Wilder smoothing).
    if (i < 14) {
      this.avgGain[i] = NA;
      this.avgLoss[i] = NA;
      s.rsi14[i] = NA;
    } else {
      let ag: number;
      let al: number;
      if (i === 14) {
        let gain = 0;
        let loss = 0;
        for (let j = 1; j <= 14; j++) {
          const ch = closes[j]! - closes[j - 1]!;
          if (ch >= 0) gain += ch;
          else loss -= ch;
        }
        ag = gain / 14;
        al = loss / 14;
      } else {
        const ch = closes[i]! - closes[i - 1]!;
        ag = (this.avgGain[i - 1]! * 13 + (ch >= 0 ? ch : 0)) / 14;
        al = (this.avgLoss[i - 1]! * 13 + (ch < 0 ? -ch : 0)) / 14;
      }
      this.avgGain[i] = ag;
      this.avgLoss[i] = al;
      s.rsi14[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }

    // MACD 12 26 9 — the signal EMA is seeded from the first defined MACD (25).
    this.emaFast[i] = emaAt(closes, this.emaFast, 12, i);
    this.emaSlow[i] = emaAt(closes, this.emaSlow, 26, i);
    const ef = this.emaFast[i]!;
    const es = this.emaSlow[i]!;
    const m = Number.isNaN(ef) || Number.isNaN(es) ? NA : ef - es;
    s.macd.macd[i] = m;
    const sig = emaAt(s.macd.macd, s.macd.signal, 9, i, 25);
    s.macd.signal[i] = sig;
    s.macd.histogram[i] = Number.isNaN(m) || Number.isNaN(sig) ? NA : m - sig;

    // VWAP, reset each UTC day.
    const typical = (c.highs[i]! + c.lows[i]! + closes[i]!) / 3;
    const v = c.volumes[i]!;
    const sameSession =
      i > 0 &&
      Math.floor(c.times[i]! / SESSION_MS) ===
        Math.floor(c.times[i - 1]! / SESSION_MS);
    const pv = (sameSession ? this.cumPV[i - 1]! : 0) + typical * v;
    const vol = (sameSession ? this.cumV[i - 1]! : 0) + v;
    this.cumPV[i] = pv;
    this.cumV[i] = vol;
    s.vwap[i] = vol === 0 ? typical : pv / vol;
  }
}
