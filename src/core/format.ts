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
