/**
 * Interval math (RESEARCH §8). Pure, framework-agnostic, Node-testable.
 *
 * Fixed intervals use exact ms. `1w` and `1M` need real calendar alignment:
 *   - Binance weeks start **Monday 00:00 UTC** (epoch 0 is a Thursday, so a
 *     plain modulo would mis-align weeks).
 *   - Months align to the **1st of the month 00:00 UTC** and vary in length.
 */

import type { Interval, IntervalMeta, Millis } from '../types';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Average month length; only an approximation — never use for boundary math. */
const MONTH_APPROX = Math.round(30.4375 * DAY);

/** Nominal duration of each interval in ms (`1M` approximate). */
export const INTERVAL_MS: Record<Interval, number> = {
  '1s': SECOND,
  '5s': 5 * SECOND,
  '15s': 15 * SECOND,
  '30s': 30 * SECOND,
  '1m': MINUTE,
  '3m': 3 * MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '2h': 2 * HOUR,
  '4h': 4 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '1d': DAY,
  '3d': 3 * DAY,
  '1w': WEEK,
  '1M': MONTH_APPROX,
};

const INTERVAL_LABEL: Record<Interval, string> = {
  '1s': '1 sec',
  '5s': '5 sec',
  '15s': '15 sec',
  '30s': '30 sec',
  '1m': '1 min',
  '3m': '3 min',
  '5m': '5 min',
  '15m': '15 min',
  '30m': '30 min',
  '1h': '1 hour',
  '2h': '2 hours',
  '4h': '4 hours',
  '6h': '6 hours',
  '12h': '12 hours',
  '1d': '1 day',
  '3d': '3 days',
  '1w': '1 week',
  '1M': '1 month',
};

/** Ordered interval list (for selectors). */
export const INTERVALS: readonly Interval[] = [
  '1s',
  '5s',
  '15s',
  '30s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
] as const;

/** Commonly-shown intervals, surfaced as inline chips (PLAN §6.2). */
export const COMMON_INTERVALS: readonly Interval[] = [
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
] as const;

export function intervalToMs(interval: Interval): number {
  return INTERVAL_MS[interval];
}

export function intervalMeta(interval: Interval): IntervalMeta {
  return {
    interval,
    ms: INTERVAL_MS[interval],
    label: INTERVAL_LABEL[interval],
  };
}

export const INTERVAL_METAS: readonly IntervalMeta[] =
  INTERVALS.map(intervalMeta);

/**
 * Align a timestamp DOWN to the open time of the bar that contains it.
 * Handles calendar `1w` (Monday-anchored) and `1M` (month-anchored) correctly.
 */
export function floorToInterval(timeMs: Millis, interval: Interval): Millis {
  if (interval === '1M') {
    const d = new Date(timeMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
  }
  if (interval === '1w') {
    // Shift epoch so weeks start on Monday, floor, shift back. (Epoch 0 = Thursday.)
    const MONDAY_OFFSET = 4 * DAY; // Thu -> Mon
    return Math.floor((timeMs + MONDAY_OFFSET) / WEEK) * WEEK - MONDAY_OFFSET;
  }
  const ms = INTERVAL_MS[interval];
  return Math.floor(timeMs / ms) * ms;
}

/** Open time of the bar immediately after the one containing `timeMs`. */
export function nextBarOpen(timeMs: Millis, interval: Interval): Millis {
  const start = floorToInterval(timeMs, interval);
  if (interval === '1M') {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  }
  if (interval === '1w') return start + WEEK;
  return start + INTERVAL_MS[interval];
}
