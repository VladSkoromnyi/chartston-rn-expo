/**
 * Indicator registry (PLAN §6.3, RESEARCH §9). Studies are declarative
 * {@link StudyDescriptor}s so consumers can ship their own.
 *
 * TODO(stage-7): built-in descriptors — overlays (SMA, EMA, WMA, Bollinger,
 * VWAP) and panes (Volume, RSI, MACD, Stochastic, ATR). Each `compute` is pure
 * and incremental (Wilder smoothing for RSI/ATR — see RESEARCH §9), validated
 * against reference fixtures in the test plan.
 */

import type { StudyDescriptor } from '../../types';

const registry = new Map<string, StudyDescriptor>();

export function registerStudy(descriptor: StudyDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export function getStudy(id: string): StudyDescriptor | undefined {
  return registry.get(id);
}

export function listStudies(): StudyDescriptor[] {
  return [...registry.values()];
}
