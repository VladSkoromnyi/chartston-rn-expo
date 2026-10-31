import { describe, expect, it } from 'vitest';
import { autoScale } from '../autoscale';
import { CandleStore } from '../candle-store';
import {
  formatCompact,
  formatPrice,
  formatQty,
  formatTimeLabel,
} from '../format';
import { getStudy, listStudies, registerStudy } from '../indicators';
import { initialViewport, toViewport, visibleRange } from '../viewport';
import type { Candle, StudyDescriptor } from '../../types';

const c = (time: number, close: number): Candle => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 2,
});

describe('format', () => {
  it('formats prices and quantities to the symbol precision', () => {
    expect(formatPrice(1234.5, 2)).toBe('1234.50');
    expect(formatPrice(1.23456, -1)).toBe('1');
    expect(formatQty(0.5, 3)).toBe('0.500');
  });
  it('compacts large numbers', () => {
    expect(formatCompact(1_234)).toBe('1.23K');
    expect(formatCompact(4_500_000)).toBe('4.50M');
    expect(formatCompact(2e9)).toBe('2.00B');
    expect(formatCompact(3e12)).toBe('3.00T');
    expect(formatCompact(42)).toBe('42');
  });
  it('labels time as UTC HH:MM', () => {
    expect(formatTimeLabel(Date.UTC(2026, 0, 1, 7, 5))).toBe('07:05');
  });
});

describe('viewport', () => {
  it('starts pinned to the live edge', () => {
    const v = initialViewport(500, 400, 8);
    expect(v).toMatchObject({ offset: 450, barSpacing: 8, pinnedToNow: true });
    expect(initialViewport(10, 400, 8).offset).toBe(0);
  });
  it('clips the visible range to the data', () => {
    const v = initialViewport(500, 400, 8);
    expect(visibleRange(v, 400, 500)).toEqual({ start: 450, end: 499 });
    expect(visibleRange({ ...v, offset: -3 }, 400, 500).start).toBe(0);
  });
  it('treats zero bar spacing as nothing visible', () => {
    expect(toViewport(0, 0, 400, 100, false).pinnedToNow).toBe(false);
  });
});

describe('autoScale', () => {
  it('pads the visible high/low', () => {
    const store = new CandleStore();
    store.apply({ type: 'snapshot', candles: [c(0, 10), c(1, 20)] });
    expect(autoScale(store.view(), 0, 1)).toEqual({ min: 7.8, max: 22.2 });
  });
  it('widens a flat range and handles an empty view', () => {
    const store = new CandleStore();
    expect(autoScale(store.view(), 0, 5)).toEqual({ min: 0, max: 1 });
    store.apply({
      type: 'snapshot',
      candles: [{ time: 0, open: 5, high: 5, low: 5, close: 5 }],
    });
    const r = autoScale(store.view(), 0, 0);
    expect(r.min).toBeLessThan(5);
    expect(r.max).toBeGreaterThan(5);
  });
});

describe('CandleStore', () => {
  it('ingests by time: append, patch, drop out-of-order', () => {
    const s = new CandleStore();
    expect(s.apply({ type: 'patch', candle: c(0, 1) })).toBe('append');
    expect(s.apply({ type: 'append', candle: c(1, 2) })).toBe('append');
    expect(s.apply({ type: 'patch', candle: c(1, 3) })).toBe('patch');
    expect(s.apply({ type: 'append', candle: c(0, 9) })).toBe('noop');
    expect(s.length).toBe(2);
    const v = s.view();
    expect(v.at(1).close).toBe(3);
    expect(v.timeAt(0)).toBe(0);
    s.clear();
    expect(s.length).toBe(0);
  });
});

describe('study registry', () => {
  it('registers and looks up custom studies', () => {
    const d = { id: 'reg-test', kind: 'overlay' } as StudyDescriptor;
    registerStudy(d);
    expect(getStudy('reg-test')).toBe(d);
    expect(listStudies()).toContain(d);
  });
});
