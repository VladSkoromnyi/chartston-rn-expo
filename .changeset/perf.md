---
'chartston': minor
---

Performance (M5) — the JS-thread cost of a live tick no longer grows with the dataset:

- Built-in studies are incremental (`BuiltinStudies`): a live tick recomputes only the last bar instead of every indicator over the whole series (results match the full calculators to 1e-9). Stress screen, 50k 1s candles + a 16 ms feed with every study on: JS thread 14 → 61 fps, worst stall ~140 → ~31 ms; at 10k: 35 → 60 fps (iOS Simulator, debug build).
- Rendering moved off React: the canvas shows one SkPicture held in a shared value; gestures, the crosshair and live ticks feed a single per-frame `redraw()` (frame geometry + imperative scene recording) with no React render. Panning at 10k/50k with every study on: JS thread steady at 60–61 fps, worst stall ≤ 30 ms, 0 dropped UI frames (was 23–51 fps with 85–370 ms stalls). `onCrosshairMove` now fires when the hovered bar or its live values change (not on every pointer pixel).
- Fix: the volume overlay no longer allocates a sparse array spanning the whole dataset every frame.
- Live updates write the column arrays in place (no per-frame O(n) copy); change detection for incremental consumers uses `markColumns` / `ColumnsMark`, and `studyNeedsReset` now takes a mark.
- Skia path building moved to `SkPathBuilder` where available (no more `SkPath.moveTo/lineTo/addRect` deprecation warnings), falling back to `SkPath` on older Skia 2.x.
