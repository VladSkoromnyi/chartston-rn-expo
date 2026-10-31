/**
 * Number formatting for axes & legend (RESEARCH §7). Pure & Node-testable.
 * Precision comes from {@link SymbolInfo} (pricePrecision / qtyPrecision).
 */

export function formatPrice(price: number, precision: number): string {
  return price.toFixed(Math.max(0, precision));
}

export function formatQty(qty: number, precision: number): string {
  return qty.toFixed(Math.max(0, precision));
}

const COMPACT_UNITS: ReadonlyArray<{ v: number; s: string }> = [
  { v: 1e12, s: 'T' },
  { v: 1e9, s: 'B' },
  { v: 1e6, s: 'M' },
  { v: 1e3, s: 'K' },
];

/** Compact volume/qty for a cramped axis: 1234 -> "1.23K", 4.5e6 -> "4.50M". */
export function formatCompact(n: number, digits = 2): string {
  const abs = Math.abs(n);
  for (const { v, s } of COMPACT_UNITS) {
    if (abs >= v) return (n / v).toFixed(digits) + s;
  }
  return n.toFixed(0);
}

/**
 * Label for an arbitrary-scale value (custom study pane axes): compact above
 * 1K, 2 decimals above 1, 3 significant digits below — so 0.0042 doesn't read "0".
 */
export function formatAxisValue(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e3) return formatCompact(n);
  if (abs >= 1 || abs === 0) return n.toFixed(abs === 0 ? 0 : 2);
  return n.toPrecision(3);
}

/** Time-of-day label (UTC HH:MM) for the time axis. */
export function formatTimeLabel(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
