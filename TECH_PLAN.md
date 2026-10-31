# TECH_PLAN.md — Chartston

> **Status (2026-11-01): v0.2.0 published to npm; v0.3.0 in progress on `develop`.** Stages 0–9 and the
> post-0.2 milestones M2–M6 are done (see C.2 and C.6). Remaining before the v0.3.0 release: M8 (Support
> section) and M7 (release). This file was the bootstrap plan (PLAN.md Part C) and is now the living
> engineering status.
>
> Read alongside [`PLAN.md`](./PLAN.md) (the brief) and [`RESEARCH.md`](./RESEARCH.md) (the behavioral spec).

---

## 0. Current state

Two sibling projects under `~/Developer/` (moved out of iCloud-synced `~/Documents/projects/` on
2026-10-31 — iCloud was offloading `node_modules` and making every build crawl):

### `chartston/` — the library (the product)
- JavaScript library on Skia + Reanimated + Gesture Handler, New Architecture only. Yarn 4, strict TS,
  ESM build via `react-native-builder-bob`, MIT. **Published:** `chartston@0.2.0` (npm, 2026-06-30).
- **Entry points:** `chartston` (engine, `<Chart/>`, types, adapters, themes, `core` helpers) and
  `chartston/ui` (bottom-sheet selectors; `@gorhom/bottom-sheet` is an optional peer used only there).
- **Layout:** `core/` (pure: intervals, coords, columns + live apply / gap merge, incremental studies,
  calculators, throttle) · `render/` (Skia path builders via `makePath`) · `react/` (`Chart.tsx` +
  `frame.ts` geometry + `scene.ts` picture recording) · `gestures/` (UI-thread worklets) · `stream/`
  (Binance + mock adapters) · `ui/`.
- **Quality gates (CI):** ESLint/Prettier · `tsc` · vitest `core/` with a coverage gate (lines ≥ 90 %;
  currently 98 %) · jest `<Chart/>` integration suite · bob build. Manual checklists in `qa/`.

### `chartston-dev-test/` — the demo app (harness)
- Expo SDK 56 / RN 0.85.3 / React 19.2.3 dev client, linked to the library **by source** (Metro
  `chartston-source` condition + single-copy resolver for native singletons).
- Tabs: **Home** (live Binance chart with every control, annotation tools, `Log` / `Custom` / `1s` /
  `Drop 8s` test switches, viewport readout) · **Demo** (deterministic `DEMO / USD` feed; the README GIF
  scenes) · **Stress** (500 / 10k / 50k candles on a 16 ms feed with UI/JS fps meters).
- All visual / device verification goes through this app (iOS Simulator).

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
| **Indicators** | RSI/MACD/SMA/EMA/Bollinger/VWAP/ATR/Stochastic values match a reference (screenshot or fixture) within ε; panes recompute live; add/remove works. |
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
| **1 — Static render** ✅ | Draw candles | `render/candles` ✅ (body/wick + up/down/border colors), grid + axis lines ✅, `<Chart/>` adapter→store→autoscale→draw ✅; `SkFont` axis labels ✅ | rendering group | 500-candle dataset renders on device ✅. Pixel-diff vs a reference image never automated — covered by `qa/rendering.md`. |
| **2 — Viewport & gestures** ✅ | Navigate at scale | `gestures/` (pan/pinch/momentum) ✅, shared-value viewport + clipping + autoscale ✅, devDeps aligned to Expo 56 ✅ | gestures@10k | **pan/pinch verified on device** (animates on change). Follow-up done in M5: per-frame redraw no longer goes through React (60 fps @ 10k/50k on sim). |
| **3 — Crosshair & legend** ✅ | Inspect bars | long-press snap-to-index crosshair, synchronized OHLCV legend, last-price line | crosshair cases | ✅ crosshair snaps to bars; `onCrosshairMove` fires (verified on sim; drives the demo app's annotation tools). |
| **4 — Streaming core** ✅ | Live "on the fly" | `core/columns` patch/append wiring ✅, **mock feed** live ticks ✅, pin-to-now advance ✅; ≤ 1 apply per frame + in-place columns ✅ (M4/M5) | live-streaming group | **verified on sim** — active bar close/volume + last-price line update each tick, no whole-series flicker. |
| **5 — WS engine + Binance** ✅ | Real live data | Binance REST+WS ✅, time-keyed backfill↔live merge ✅, reconnect (backoff+jitter) + staleness heartbeat ✅, status surfacing ✅ | reconnect group | **verified on sim with REAL BTCUSDT 1m** — backfill+live, active-bar patch + new-bar append with view-advance. Forced-disconnect reconnect: logic in place, not exercised here. |
| **6 — Switch UI** ✅ | Generic UI | `SelectList→BottomSheet→onSelect` ✅ + PeriodSelector ✅ + SymbolSelector (searchable) ✅ | switch group | **verified on sim** — sheet opens, interval switch loads new data; race-safe via `<Chart/>` re-subscribe. |
| **7 — Studies** ✅ | Bottom-line + overlays | 9 pure calculators (SMA/EMA/WMA, Bollinger, RSI/ATR Wilder, MACD, Stochastic, VWAP) + **vitest suite (29 tests)** ✅; SMA/EMA/Bollinger/VWAP **overlays** ✅; Volume/RSI/MACD **sub-panes** (multi-pane layout: per-pane y-origin + autoscale, shared x-axis) ✅; **IndicatorMenu** (multi-select on `SelectList`) + typed `activeStudies` prop ✅ | indicator group (vitest) | **rendering verified on sim** — overlays + 3 sub-panes draw with correct colors/scales/separators, crosshair/legend/last-price intact; calc values unit-tested vs. reference. Menu tap-toggle + gestures = Vlad's finger-test. (`StudyDescriptor` declarative built-ins deferred — the curated built-in set is wired natively.) |
| **8 — Theming & polish** ✅ (code) | Production feel | dark/light **ThemeSelector** ✅; **chart types** line/area/bar/baseline + ChartTypeSelector ✅; **markers + price lines** (declarative) ✅; **basic drawing tools** (trend + horizontal, data-coord, per-symbol) ✅; **states** (loading/empty/error+retry + connection-status chip from `onStatus`) ✅ | states + theme | **code-verified** (lib tsc/eslint/**33** tests + harness tsc + bundle 200); dev-stage audit done — removed no-op stubs (StreamEngine / react hooks / drawCrosshair). **Device finger-test pending** (screenshots off) → merge to develop after. In-chart drawing-mode toolbar = v2. |
| **9 — Release** ✅ (v0.1.0, v0.2.0) | Ship OSS | **CI** (lint/typecheck/**33 tests**/bob) ✅, **Changesets** ✅ (config + cli + scripts + initial changeset; `changeset status` green), **real README** + PR template ✅, JS-only `files` + stale Expo-55 `example`/turbo retired ✅ | full regression | ✅ v0.2.0 on npm. Demo GIFs → M2 ✅; `chartston/ui` → M3 ✅; Docusaurus → v2. |

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

## C.6 Post-0.2 milestones (agreed 2026-10-31)

Order: **M3 → M4 → M5 → M6 → M2 → M1 → M8 → M7**. Each on its own branch off `develop`, verified in the
demo app, merged `--no-ff`.

| Milestone | Status | What landed |
|---|---|---|
| **M3 — API completeness** | ✅ `feat/api-completeness` | custom `studies: StudyDescriptor[]` (overlays + panes, incremental compute, throwing study skipped); `logScale`; `onViewportChange` (throttled ~100 ms, trailing); `chartston/ui` subpath (**breaking**); fix: no extra history page on every load |
| **M4 — Stream hardening** | ✅ `feat/stream-hardening` | reconnect gap fill (`mergeRecent`, REST corrects closed bars); live ticks coalesced to ≤ 1 apply per frame (`applyUpdates`); replay-fixture tests |
| **M5 — Performance** | ✅ `feat/perf` | incremental built-in studies; in-place column writes; React-free per-frame scene (SkPicture in a shared value); `SkPathBuilder` migration. 50k / 10k with every study: JS 14 / 35 → 61 / 60 fps idle, 60–61 fps panning (sim, debug) |
| **M6 — QA & tests** | ✅ `feat/qa` | `qa/` checklists (57 cases); `core/` coverage gate; jest `<Chart/>` integration suite (14); fix: overlays used removed `StyleSheet.absoluteFillObject` |
| **M2 — Demo GIFs** | ✅ `feat/demo-gifs` | 5 GIFs in `docs/media/` (0.7–1.1 MB) from the Demo tab; `scripts/make-gif.sh` |
| **M1 — Docs sync** | ✅ `chore/docs-sync` | this update; `main` back-merged into `develop` |
| **M8 — Support section** | ⏳ | README "Support" section (Monobank, Payoneer) — last task before release |
| **M7 — Release v0.3.0** | ⏳ | `develop → stage → release_0.3.0_<date> → main`, tag, `npm publish` **only on Vlad's explicit go** |

### Resolved decisions
| Question (from the bootstrap) | Decision |
|---|---|
| Subpath exports `chartston/ui` | **Yes** — shipped in M3 (breaking for 0.2 imports; called out in the changeset). |
| GitHub identity | `VladSkoromnyi/chartston-rn-expo` (live). |
| Version alignment | Library devDeps pinned to the demo app's Expo 56 versions (RN 0.85.3, React 19.2.3); peer ranges stay broad. |
| Docusaurus site | **v2.** A Next.js site exists in the sibling `chartston-docs` repo. |
| Demo media | iOS Simulator only for now; no Android capture. |

### Known follow-ups (not scheduled)
- **Physical-device + release-build** performance pass (TECH_PLAN target) — run `qa/performance.md`.
- Time-axis labels need seconds on sub-minute intervals (all read `HH:MM` on `1s`).
- Markers whose time is outside the view snap to the nearest *visible* bar (pinned at the edge).
- Status chip reads *Offline* rather than *Reconnecting…* when an adapter reports `closed` after `reconnecting`.
- A true UI-thread (worklet) geometry rebuild — only if device numbers fall short after M5.
- Monetization split (open-core boundary) — still a carry-forward note, nothing built.
