# Performance

Budget (TECH_PLAN C.1.4): **60 fps, < 1 % dropped frames at 10k candles on a
physical device**, release build. The Stress tab prints one line per second to
the Metro log:

```
[STRESS] n=10000 studies=on ui=61 uiDropped=0 js=61 jsMaxGap=20ms
```

`ui` / `uiDropped`: UI-thread frames and frames over 1.5 × 16.7 ms. `js`: JS
frames; `jsMaxGap`: longest JS stall in that second.

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| PERF-01 | Stress, 10k, Studies on | Idle 30 s (live ticks only) | `js` ≥ 58, `uiDropped` 0 | S1 |
| PERF-02 | Stress, 50k, Studies on | Idle 30 s | `js` ≥ 55, `jsMaxGap` < 50 ms | S2 |
| PERF-03 | Stress, 10k then 50k | Pan back and forth continuously for 10 s | `js` ≥ 55 every second, `jsMaxGap` < 50 ms, `uiDropped` ≤ 1 % of `ui` | S1 |
| PERF-04 | Stress, 10k | Pinch in and out continuously for 10 s | Same as PERF-03 | S2 |
| PERF-05 | Home | Leave on the live 1s chart for 10 min | Memory stays flat (Xcode / Android Studio memory gauge) | S2 |

Baseline (iOS Simulator, debug build, 2026-11-01):

| | 10k idle | 50k idle | 10k pan | 50k pan |
|---|---|---|---|---|
| JS fps | 60–61 | 61 | 60–61 | 61 |
| worst JS stall | ~27 ms | ~29 ms | ≤ 30 ms | ≤ 28 ms |
| UI dropped | 0 | 0 | 0 | 0 |
