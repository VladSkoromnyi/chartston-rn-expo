/**
 * `core/` — framework-agnostic math & data. NO React, NO Skia at runtime.
 * This is the layer that is unit-tested in plain Node (PLAN §5.1).
 */

export * from './interval';
export * from './coords';
export * from './autoscale';
export * from './format';
export * from './candle-store';
export * from './indicators';
export * from './viewport';
export * from './ticks';
export * from './columns';
