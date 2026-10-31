/**
 * Chartston — public API barrel.
 *
 * `render/` and `gestures/` are intentionally NOT re-exported: they are internal
 * Skia/worklet layers. Everything a consumer needs — the component, the full type
 * surface, the feed adapters, default themes, and the pure `core` helpers
 * (interval + coordinate math) — is here.
 *
 * The bottom-sheet selectors live in the `chartston/ui` subpath so the engine has
 * no dependency on `@gorhom/bottom-sheet` (an optional peer, needed only there).
 */

export * from './types';
export * from './core';
export * from './stream';
export * from './react';
export * from './theme';
