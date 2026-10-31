/**
 * Custom-study plumbing for `<Chart studies={…}/>` (the {@link StudyDescriptor}
 * extensibility seam). Pure & Node-testable: running `compute`, deciding when a
 * study must start over, and finding a pane's visible value range. The Skia
 * `draw` step lives in `<Chart/>`.
 */

import type {
  CandleView,
  PriceRange,
  StudyDescriptor,
  StudyState,
} from '../types';
import type { CandleColumns } from './columns';

/** A study's last result, keyed to the descriptor that produced it. */
export interface StudyRun {
  descriptor: StudyDescriptor;
  state: StudyState;
}

/** Wrap plain columns as the typed-array {@link CandleView} studies consume. */
export function columnsToView(cols: CandleColumns): CandleView {
  const times = Float64Array.from(cols.times);
  const opens = Float64Array.from(cols.opens);
  const highs = Float64Array.from(cols.highs);
  const lows = Float64Array.from(cols.lows);
  const closes = Float64Array.from(cols.closes);
  const volumes = Float64Array.from(cols.volumes);
  return {
    length: times.length,
    at: (i) => ({
      time: times[i]!,
      open: opens[i]!,
      high: highs[i]!,
      low: lows[i]!,
      close: closes[i]!,
      volume: volumes[i]!,
    }),
    timeAt: (i) => times[i]!,
    times,
    opens,
    highs,
    lows,
    closes,
    volumes,
  };
}

/**
 * True when `next` is not `prev` plus a live patch/append — i.e. indices shifted
 * or history was replaced — so incremental state is meaningless.
 */
export function studyNeedsReset(
  prev: CandleColumns | null,
  next: CandleColumns
): boolean {
  if (!prev) return true;
  const p = prev.times.length;
  const n = next.times.length;
  if (p === 0 || n < p) return true;
  return (
    prev.times[0] !== next.times[0] || prev.times[p - 1] !== next.times[p - 1]
  );
}

/**
 * Run every descriptor's `compute`. `prev` state is handed back only when the
 * data continued (`reset` false) AND it's the same descriptor object — swapping a
 * descriptor (new inputs) starts it fresh. A throwing study is dropped.
 */
export function runStudies(
  descriptors: readonly StudyDescriptor[],
  view: CandleView,
  prevRuns: ReadonlyMap<string, StudyRun> | null,
  reset: boolean
): Map<string, StudyRun> {
  const out = new Map<string, StudyRun>();
  for (const d of descriptors) {
    const prev = reset ? undefined : prevRuns?.get(d.id);
    try {
      const state = d.compute(
        view,
        prev && prev.descriptor === d ? prev.state : undefined
      );
      out.set(d.id, { descriptor: d, state });
    } catch {
      // A consumer study bug must not take the chart down — skip it.
    }
  }
  return out;
}

/** Min/max of the finite values across all of `state.series` within [start, end]. */
export function seriesExtent(
  state: StudyState,
  start: number,
  end: number
): PriceRange | null {
  let min = Infinity;
  let max = -Infinity;
  for (const arr of Object.values(state.series)) {
    const hi = Math.min(end, arr.length - 1);
    for (let i = Math.max(0, start); i <= hi; i++) {
      const v = arr[i]!;
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return Number.isFinite(min) ? { min, max } : null;
}
