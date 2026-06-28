# TECH_PLAN.md — Chartston

> **Status: AWAITING HUMAN APPROVAL.** This is the bootstrap deliverable (PLAN.md Part C / Step 5). No
> production feature code is written until Vlad reviews and approves this plan. Stage 0 (scaffold + harness)
> is **done and verified**; everything from Stage 1 on is proposed, not built.
>
> Read alongside [`PLAN.md`](./PLAN.md) (the brief) and [`RESEARCH.md`](./RESEARCH.md) (the behavioral spec).

---

## 0. Current state — what the bootstrap actually produced (verified)

Two sibling projects under `~/Documents/projects/`:

### `chartston/` — the library (the product)
- Scaffolded with `create-react-native-library@0.63` as a **JavaScript library** (`--type library`, no native
  module of its own — it *composes* Skia/Reanimated). Yarn 4 workspace internally; **MIT**; strict TS.
- **`src/` skeleton** laid down per PLAN §5.1: `core/ render/ gestures/ stream/ ui/ react/ types/` + `theme.ts`.
  - `types/index.ts` — the **full §7 public type surface** (single source of truth). ✅ complete.
  - `core/` — **implemented & pure** (Node-testable): `interval.ts` (ms table + calendar-correct `1w`/`1M`
    flooring), `coords.ts` (index↔x, price↔y inverses, log scale), `autoscale.ts`, `format.ts`,
    `candle-store.ts` (time-keyed snapshot/append/patch; typed-array `CandleView`). `indicators/` = registry stub.
  - `render/ gestures/ stream/ ui/ react/hooks` — **typed stubs** with `TODO(stage-N)` markers tying each to the roadmap.
  - `react/Chart.tsx` — **placeholder** that renders an empty Skia `<Canvas>` with price/time axes + gridlines.
- **peerDependencies** set: `react >=19`, `react-native >=0.79`, `@shopify/react-native-skia >=2`,
  `react-native-reanimated >=4`, `react-native-worklets >=0.4`, `react-native-gesture-handler >=2.31`,
  `@gorhom/bottom-sheet >=5` (optional). Same set installed as devDeps for standalone typecheck/build.
- **Verified:** `tsc -p tsconfig.build.json` ✅ · `eslint src` ✅ (0 errors) · `bob build` ✅ (19 files → ESM + d.ts).

### `chartston-dev-test/` — the harness
- `create-expo-app@latest` **default template** → **Expo SDK 56 / RN 0.85.3 / React 19.2.3**, New Architecture
  + React Compiler **on** by default, `expo-router` with `NativeTabs` (bottom tab bar).
- Linked to the library via **`"chartston": "file:../chartston"`** (npm symlink), resolved to **source** for
  hot-reload.
- `metro.config.js` — watches the sibling lib, `disableHierarchicalLookup` + single `nodeModulesPaths` to force
  **one copy** of the native singletons, `chartston-source` export condition for source resolution.
- `babel.config.js` — `babel-preset-expo` + **`react-native-worklets/plugin` last**.
- Root wrapped in `GestureHandlerRootView`; **tab 1 = full-screen `<Chart/>`** fed by a `MockFeedAdapter`.
- **Verified:** `tsc --noEmit` ✅ · **native dev-client build (EAS local) running on the iPhone 17 Pro sim ✅** —
  the placeholder `<Chart/>` renders (dark theme, price/time axes + gridlines), no redbox, Metro bundle clean (1998 modules).
- **Metro single-copy fix (found on first device run):** the initial `disableHierarchicalLookup` approach broke
  resolution of reanimated's *nested* `semver` (`Unable to resolve module semver/functions/satisfies`). Replaced with
  a targeted `resolver.resolveRequest` that redirects **only the singletons** to the app's copy and leaves hierarchical
  resolution intact. Verified on device.

### Deltas found during bootstrap (detail in `RESEARCH.md` §14)
| # | Finding | Resolution |
|---|---|---|
| 1 | `create-react-native-library` templates the **library's bundled example on Expo SDK 55**, below the SDK-56 floor. | Off critical path (dev-test is the real harness, on 56). Align/remove the example in Stage 0 cleanup. |
| 2 | Expo SDK 56 ships **gesture-handler 2.31.1**, not 3.x. | Library GH peer floor set to `>=2.31.0`; align library's GH devDep to 2.31.x when gestures land (Stage 2). |
| 3 | Library devDeps drifted slightly ahead of Expo pins (skia 2.6.8 vs 2.6.2, reanimated 4.5 vs 4.3, worklets 0.10 vs 0.8). | Harmless (single-copy means the **app's** versions run); align devDeps to Expo pins in Stage 2 for build fidelity. |
| 4 | bob targets are **ESM-only** (`module` + `typescript`, no CJS). | Fine for Metro/RN ≥0.79. Add a CJS target only if a Node consumer ever imports `core/` headless. |
| 5 | Binance ping cadence in PLAN §8.2 (~20s) is product/版本-dependent. | Engine auto-pongs + uses a staleness timer instead of a hard-coded number (C.3). |
| 6 | `noUncheckedIndexedAccess` is on. | Kept on; hot loops use length-checked access. A genuine strictness win for the typed-array paths. |

---

## C.1 Testing & QA strategy

### C.1.1 Manual QA checklist (`qa/` — human-runnable)
A `qa/` folder of Markdown checklists, one per feature area; each case has **ID · preconditions · steps ·
expected · severity**. Grouped:

| Group | Representative cases |
|---|---|
| **Rendering** | body=open↔close & wick=high↔low geometry; up/down/border/wick colors independent; doji renders a hairline; grid + axis labels with `SkFont`; theme dark/light. |
| **Live streaming** | active-bar `patch` mutates last candle only; new-bar `append` advances pinned view; **no whole-series flicker**; volume bar recolors with direction. |
| **Symbol/interval switch** | switch feels instant; viewport re-fits; no leaked socket (assert via status chip); stale response for old symbol discarded. |
| **Gestures @ 10k** | pan/pinch/momentum at 60fps; pinch anchors on focal bar; crosshair long-press snaps to index; OHLCV legend correct. |
| **Indicators** | RSI/MACD/SMA/EMA/Bollinger/VWAP/ATR/Stochastic values match a reference (TradingView screenshot or fixture) within ε; panes recompute live; add/remove works. |
| **Reconnect** | forced disconnect → reconnects w/ backoff; re-backfills missed bars; no gap/dup at the seam. |
| **States** | empty / loading / error / offline render correctly. |

### C.1.2 Automated tests
| Layer | Tooling | What |
|---|---|---|
| **`core/` (unit)** | **Vitest** (Node, ESM, no RN) | interval math (incl. `1w`/`1M` boundaries), coord transforms **and their inverses** (round-trip property tests), autoscale, formatting, `CandleStore` snapshot/append/patch + out-of-order drop, indicator calculators vs **Wilder fixtures**, backfill↔live dedupe. **Coverage target ≥ 90% lines for `core/`.** |
| **`react/` (integration)** | **jest** + `jest-expo` + `@testing-library/react-native` (+ reanimated/skia mocks) | mount `<Chart/>`, drive the **mock/replay feed**, assert update semantics (one repaint per frame, active-bar mutation, append advances pinned view), `onCrosshairMove` fires with the right bar. |
| **Streaming** | Vitest + replay feed | `StreamEngine` determinism: backfill→live merge, reconnect-resume, coalescing, switch race-safety (generation id). |

Skia pixels aren't asserted in jsdom; rendering correctness is covered by the **manual** rendering group + an
optional on-device screenshot diff (v2). The data→update pipeline (the bug-prone part) is fully automatable.

### C.1.3 UI variations to prototype (build 2–3 in the harness Playground, pick before locking)
| Surface | Variants | Decision criteria |
|---|---|---|
| **PeriodSelector** | (a) inline chips + "more" sheet · (b) segmented control · (c) single chip → full sheet | thumb reach, discoverability of full set, space at top. |
| **Crosshair legend** | (a) floating top-left OHLC row · (b) inline top ticker bar · (c) values pinned to axes | readability over candles, occlusion, glance speed. |
| **IndicatorMenu** | (a) categorized sheet · (b) searchable flat list · (c) two-tab overlays/panes | scalability to many studies, add/remove friction. |
| **Bottom sheet** | (a) `@gorhom/bottom-sheet` · (b) Expo UI `BottomSheet` | gesture feel, New-Arch fit, dep weight. |

### C.1.4 Performance harness (recommended)
A `Playground/Stress` screen: load N candles (10k / 50k), run the fast replay feed, show an FPS / dropped-frame
counter (from a `useFrameCallback` tick). **Budget: 60fps, <1% dropped frames at 10k on a physical device.**
A perf job records this so regressions are visible.

---

## C.2 Development stages (refined from PLAN §D.1)

Core first, then one feature at a time; each stage is independently demoable in the harness and shippable behind
a green QA checklist. Each stage branches off `develop` as `feat/stage-N-*` and merges back to `develop`.

| Stage | Goal | Key deliverables | New QA | Exit criteria |
|---|---|---|---|---|
| **0 — Scaffold** ✅ | Skeleton + harness | §5.1 dirs, full `types/`, pure `core/`, placeholder `<Chart/>`, linked harness | — | **lib tsc/lint/bob ✅, harness tsc ✅, native run on iOS sim ✅** (placeholder renders; Metro clean). |
| **1 — Static render** ⏳ | Draw candles | `render/candles` ✅ (body/wick + up/down/border colors), grid + axis lines ✅, `<Chart/>` adapter→store→autoscale→draw ✅; **next:** `SkFont` axis labels, typed-array rect/line buffers | rendering group | 500-candle dataset renders on device ✅ (`feat/stage-1-static-render`); pixel-correct-vs-reference (with labels) pending. |
| **2 — Viewport & gestures** ✅ | Navigate at scale | `gestures/` (pan/pinch/momentum) ✅, shared-value viewport + clipping + autoscale ✅, devDeps aligned to Expo 56 ✅ | gestures@10k | **pan/pinch verified on device** (animates on change). Follow-up: move rebuild to the UI thread for 60fps@10k (JS rebuild for now — worklet-built paths were flaky). |
| **3 — Crosshair & legend** | Inspect bars | long-press snap-to-index crosshair, synchronized OHLCV legend, last-price line | crosshair cases | crosshair reports correct bar; `onCrosshairMove` fires. |
| **4 — Streaming core** ✅ | Live "on the fly" | `core/columns` patch/append wiring ✅, **mock feed** live ticks ✅, pin-to-now advance ✅; **follow-up:** ring-buffer + rAF coalescing for high-freq feeds | live-streaming group | **verified on sim** — active bar close/volume + last-price line update each tick, no whole-series flicker. |
| **5 — WS engine + Binance** ✅ | Real live data | Binance REST+WS ✅, time-keyed backfill↔live merge ✅, reconnect (backoff+jitter) + staleness heartbeat ✅, status surfacing ✅ | reconnect group | **verified on sim with REAL BTCUSDT 1m** — backfill+live, active-bar patch + new-bar append with view-advance. Forced-disconnect reconnect: logic in place, not exercised here. |
| **6 — Switch UI** ✅ | Generic UI | `SelectList→BottomSheet→onSelect` ✅ + PeriodSelector ✅ + SymbolSelector (searchable) ✅ | switch group | **verified on sim** — sheet opens, interval switch loads new data; race-safe via `<Chart/>` re-subscribe. |
| **7 — Studies** ✅ | Bottom-line + overlays | 9 pure calculators (SMA/EMA/WMA, Bollinger, RSI/ATR Wilder, MACD, Stochastic, VWAP) + **vitest suite (29 tests)** ✅; SMA/EMA/Bollinger/VWAP **overlays** ✅; Volume/RSI/MACD **sub-panes** (multi-pane layout: per-pane y-origin + autoscale, shared x-axis) ✅; **IndicatorMenu** (multi-select on `SelectList`) + typed `activeStudies` prop ✅ | indicator group (vitest) | **rendering verified on sim** — overlays + 3 sub-panes draw with correct colors/scales/separators, crosshair/legend/last-price intact; calc values unit-tested vs. reference. Menu tap-toggle + gestures = Vlad's finger-test. (`StudyDescriptor` declarative built-ins deferred — the curated built-in set is wired natively.) |
| **8 — Theming & polish** | Production feel | dark/light, markers/price lines, basic drawing tools (trend + horizontal line); chosen UI variants | states + theme | variants locked; theme switch clean. |
| **9 — Release** | Ship OSS | docs site, README w/ demo GIFs, Changesets, `npm publish` via bob, CI green | full regression | `npx`-installable; example in repo; CI green. |

Drawing tools beyond basics, multi-provider adapters, replay-export → **v2**.

---

## C.3 WebSocket engine plan (`stream/`)

**Adapter seam** (already in `types/`): `MarketFeedAdapter { name, fetchHistory(req), subscribe(req) → unsub }`.
The **Binance reference adapter** proves it (RESEARCH §13): REST `GET /api/v3/klines` (≤1000) for backfill; WS
`<symbol>@kline_<interval>` normalized by `normalizeBinanceKline` (`k.x===false` → `patch`, new `k.t` → `append`).

**`StreamEngine` responsibilities:**
1. **Backfill → live merge.** REST first, open WS, **dedupe by `time`** at the seam (no gap/double bar).
2. **Reconnect** with exponential backoff **+ jitter**, capped; on resume **re-backfill** bars missed while down.
3. **Heartbeat/liveness.** Auto-pong server pings + an **independent staleness timer** (no message in N s → dead →
   reconnect) — so the exact server cadence is irrelevant (RESEARCH §13.3 / Delta #5).
4. **Resubscribe on switch.** `gen++`, abort in-flight REST (`AbortSignal`), unsubscribe WS, clear buffers,
   backfill+resubscribe, re-fit. Stale-`gen` responses are dropped (PLAN §5.3).
5. **Coalescing.** High-frequency `patch` ticks collapse to **≤ one repaint per frame** (the `useFrameCallback`
   tick consumes the latest pending update).
6. **Status** surfaced via `onStatus` for a connection chip.

**Failure / edge matrix:**
| Event | Handling |
|---|---|
| Drop **mid-bar** | reconnect; re-backfill from last closed bar; reconcile the active bar by `time`. |
| **Out-of-order** tick (`time < last`) | `CandleStore.ingest` returns `noop` (dropped). |
| **Duplicate** bar (same `time`) | treated as `patch` (idempotent overwrite). |
| **Gap** on reconnect | re-backfill the missing `[lastTime, now]` range, dedupe, then resume live. |
| **Stale** response after switch | discarded by generation-id guard. |
| **Dead socket** (silent) | staleness timer fires → reconnect. |

**Dev/test tool:** the **mock/replay feed** (`stream/mock-feed.ts`) plays recorded JSONL klines at adjustable
speed — backbone of the deterministic streaming tests (C.1.2) and lets UI develop offline.

---

## C.4 Types & interfaces (finalized)

The surface lives in [`src/types/index.ts`](./src/types/index.ts) and is implemented exactly as PLAN §7, justified
against RESEARCH:

- **Time unit, stated loudly:** internal canonical time = **epoch milliseconds, UTC** (`type Millis`). Lightweight
  Charts uses *seconds*, Binance uses *ms* — adapters convert at the edges (e.g. a lightweight-charts adapter does
  `time: datum.time * 1000`; Binance passes `k.t` straight through). The core never sees a non-ms time.
- **`Candle` / `CandleView`** — OHLC(V); `CandleView` exposes typed-array columns (`closes`, `highs`, …) for
  zero-alloc hot loops, mirroring the autoscale/indicator access pattern.
- **`CandleUpdate` = `snapshot | append | patch`** — the direct analog of Lightweight Charts `setData` vs
  time-keyed `update` (RESEARCH §4); the single most important contract.
- **`MarketFeedAdapter`** — the extensibility seam: implement two methods to support *any* feed.
- **`Viewport`** — `offset` (fractional logical index), `barSpacing`, `rightPadding`, `pinnedToNow`, `logScale`
  — validated against LWC's logical-range model (RESEARCH §5).
- **`StudyDescriptor`** — declarative `{ kind, inputs, compute, draw }` so consumers ship their own studies;
  `compute` is pure/incremental, `draw` paints a pane.
- **`SelectOption` / `SelectListProps<T>`** — the one generic UI primitive (PLAN §6.1).
- **`ChartProps`** — `{ symbol, interval, adapter, studies?, theme?, chartType?, onCrosshairMove?, onViewportChange? }`.

**Open type decision for review:** split the package into **subpath exports** — `chartston` (engine + `<Chart/>`)
and `chartston/ui` (the bottom-sheet selectors) — so `@gorhom/bottom-sheet` is a *truly* optional peer and the
core engine has zero UI deps. Recommended; flagged for your call (affects the `exports` map).

---

## C.5 Production git-tree & OSS infrastructure

- **Branching (three long-lived branches + dated release branches):**
  - `main` — the last **stable** version. Updated *only* by merging a release branch; every merge is tagged `v<version>`. Protected.
  - `stage` — **staging**: integration testing + fixes before a release is cut.
  - `develop` — active **development**: features/fixes land here via short-lived `feat/*` and `fix/*` branches off `develop`.
  - **Release branches:** `release_<version>_<DDMMYYYY>` (e.g. `release_1.0.0_27062026`) cut from `stage`, stabilized, then merged into `main` (tag `v<version>`) and back into `develop`.
  - Flow: `feat/* → develop → stage → release_<x.y.z>_<DDMMYYYY> → main` (tag) → back-merge to `develop`.
- **Commits:** **Conventional Commits** (`feat/fix/perf/docs/test/chore`) — drives changelog + semver.
- **Versioning:** **Changesets** (not the scaffold's default) for semver + auto changelog; publish via `bob build`
  output. (Note: scaffold did not add a release tool; we add Changesets in Stage 9 infra.)
- **CI (GitHub Actions), blocking on red:** `tsc` typecheck · `eslint` · **Vitest `core/`** · `bob build`. Optional
  matrix job: build the harness for iOS/Android to catch native breakage.
- **Packaging contract:** ESM `exports` map with the `chartston-source` dev condition + `types`/`default` for
  consumers; correct `peerDependencies` (+ optional bottom-sheet); **no bundled copy of peers**; `sideEffects`
  audited; `lib/` is build output (gitignored).
- **Single-copy strategy (verified on device):** the harness forces one copy of the native singletons via a
  `resolver.resolveRequest` redirect that re-roots **only the singleton package names** at the app's `node_modules`.
  An earlier `disableHierarchicalLookup` attempt broke nested transitive resolution (reanimated's `semver`) and was
  replaced. This is the pattern to document for any consumer doing local source-linking.
- **Hygiene:** scaffold already added `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`. Stage 9 adds a
  real `README` (what/why, install, quick start, demo GIF, feature matrix, an honest comparison vs
  `react-native-livechart` / `kline-*`), issue/PR templates, badges, and a **Docusaurus** docs site with the
  `types/` reference + a live example.

---

## Decisions I need from you before Stage 1

1. **Native smoke test — ✅ DONE.** The EAS-local dev-client build runs on the iPhone 17 Pro sim; the placeholder
   chart renders and the single-copy Metro config is fixed + verified. Stage 0 is fully complete.
2. **GitHub identity.** `author`/`repo` URLs use a placeholder handle (`vlad-skoromnyi`). Confirm the real
   org/handle before any publish.
3. **Subpath exports** (`chartston` vs `chartston/ui`) to make bottom-sheet optional — yes/no? (C.4)
4. **Version-alignment policy** — pin the library's reanimated/worklets/GH devDeps to the exact Expo SDK 56 pins
   (build fidelity), or keep slightly-ahead floors? (Delta #2/#3)
5. **Monetization split** (carry-forward, not built): record the intended open-core boundary (Pro = advanced
   studies / more drawing tools / multi-provider adapters / replay-export) so `core/` stays clean for a Pro layer.

---

## Confirmation gate

Per PLAN Part E: the bootstrap produced **`RESEARCH.md`**, the **`chartston` skeleton**, the **`chartston-dev-test`
harness**, and **this `TECH_PLAN.md`**. **I am stopping here for your review.** On approval (and your answers
above), engineering proceeds **Stage 1**, one branch at a time, harness kept green.
