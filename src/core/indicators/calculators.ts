/**
 * Indicator calculators (RESEARCH §9). Pure, framework-agnostic, Node-testable.
 *
 * Each returns an array aligned to the input indices; `NaN` marks warmup indices
 * where the indicator is not yet defined (the renderer skips those). RSI and ATR
 * use **Wilder's smoothing** (the common correctness pitfall — see the tests).
 */

const NA = NaN;

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period; // seed EMA with the SMA of the first `period`
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function wma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += values[i - j]! * (period - j);
    out[i] = acc / denom;
  }
  return out;
}

export interface BollingerBands {
  middle: number[];
  upper: number[];
  lower: number[];
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2
): BollingerBands {
  const middle = sma(values, period);
  const upper = new Array<number>(values.length).fill(NA);
  const lower = new Array<number>(values.length).fill(NA);
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]!;
    let variance = 0;
    for (let j = 0; j < period; j++) {
      const d = values[i - j]! - mean;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period); // population std-dev
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NA);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    const g = ch >= 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period; // Wilder smoothing
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** EMA over an array that may have leading NaN (computed on the defined suffix, re-aligned). */
function emaOfDefined(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  const first = values.findIndex((v) => !Number.isNaN(v));
  if (first < 0) return out;
  const e = ema(values.slice(first), period);
  for (let i = 0; i < e.length; i++) out[first + i] = e[i]!;
  return out;
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    Number.isNaN(emaFast[i]!) || Number.isNaN(emaSlow[i]!)
      ? NA
      : emaFast[i]! - emaSlow[i]!
  );
  const signal = emaOfDefined(macdLine, signalPeriod);
  const histogram = macdLine.map((m, i) =>
    Number.isNaN(m) || Number.isNaN(signal[i]!) ? NA : m - signal[i]!
  );
  return { macd: macdLine, signal, histogram };
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NA);
  if (n <= period) return out;
  const tr = new Array<number>(n).fill(NA);
  tr[0] = highs[0]! - lows[0]!;
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!)
    );
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i]!;
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period; // Wilder smoothing
    out[i] = prev;
  }
  return out;
}

export interface StochasticResult {
  k: number[];
  d: number[];
}

export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3
): StochasticResult {
  const n = closes.length;
  const k = new Array<number>(n).fill(NA);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      if (highs[i - j]! > hh) hh = highs[i - j]!;
      if (lows[i - j]! < ll) ll = lows[i - j]!;
    }
    k[i] = hh === ll ? 50 : (100 * (closes[i]! - ll)) / (hh - ll);
  }
  const d = new Array<number>(n).fill(NA);
  for (let i = kPeriod - 1 + dPeriod - 1; i < n; i++) {
    let s = 0;
    for (let j = 0; j < dPeriod; j++) s += k[i - j]!;
    d[i] = s / dPeriod;
  }
  return { k, d };
}

/**
 * VWAP (cumulative within a session). `times` (ms) drive the daily reset; omit to
 * treat the whole series as one session.
 */
export function vwap(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  times?: number[],
  sessionMs = 86_400_000
): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NA);
  let cumPV = 0;
  let cumV = 0;
  let session = NA;
  for (let i = 0; i < n; i++) {
    const t = times?.[i];
    const s = t === undefined ? 0 : Math.floor(t / sessionMs);
    if (s !== session) {
      cumPV = 0;
      cumV = 0;
      session = s;
    }
    const typical = (highs[i]! + lows[i]! + closes[i]!) / 3;
    cumPV += typical * volumes[i]!;
    cumV += volumes[i]!;
    out[i] = cumV === 0 ? typical : cumPV / cumV;
  }
  return out;
}
