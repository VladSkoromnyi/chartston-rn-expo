/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * Rendering (M5): the canvas shows one SkPicture held in a shared value.
 * Gestures (UI-thread worklets), the crosshair and live ticks all funnel into a
 * single `redraw()` — at most once per animation frame — that builds the frame
 * geometry (`buildFrame`) and records it (`drawScene`). None of that goes
 * through React render: React re-renders only for prop, size, status and
 * loading/empty/error changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import {
  Canvas,
  Picture,
  createPicture,
  matchFont,
} from '@shopify/react-native-skia';
import type { SkPicture } from '@shopify/react-native-skia';
import type {
  Candle,
  CandleUpdate,
  ChartProps,
  ConnectionStatus,
  Viewport,
} from '../types';
import { DARK_THEME } from '../theme';
import {
  BuiltinStudies,
  applyUpdates,
  candlesToColumns,
  columnsToView,
  initialViewport,
  markColumns,
  mergeRecent,
  prependColumns,
  runStudies,
  studyNeedsReset,
  throttleTrailing,
  toViewport,
} from '../core';
import type {
  BuiltinSeries,
  CandleColumns,
  ColumnsMark,
  StudyRun,
} from '../core';
import { useChartGestures } from '../gestures';
import {
  DEFAULT_ACTIVE_STUDIES,
  DEFAULT_BAR_SPACING,
  EDGE_LOAD_BARS,
  EMPTY_DRAWINGS,
  EMPTY_MARKERS,
  EMPTY_PRICE_LINES,
  EMPTY_STUDIES,
  FONT_FAMILY,
  HISTORY_PAGE_SIZE,
  PRICE_AXIS_WIDTH,
  STATUS_LABEL,
  TIME_AXIS_HEIGHT,
  VIEWPORT_CHANGE_THROTTLE_MS,
  buildCross,
  buildFrame,
  noop,
} from './frame';
import { drawScene } from './scene';

type DataState = 'loading' | 'empty' | 'ready';

export function Chart(props: ChartProps): ReactElement {
  const { adapter, symbol, interval, style } = props;
  const theme = props.theme ?? DARK_THEME;
  const font = useMemo(
    () => matchFont({ fontFamily: FONT_FAMILY, fontSize: theme.fontSize }),
    [theme.fontSize]
  );

  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const plotWidth = width - PRICE_AXIS_WIDTH;
  const plotHeight = height - TIME_AXIS_HEIGHT;

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [dataState, setDataState] = useState<DataState>('loading');

  // Shared viewport + crosshair (mutated by gestures on the UI thread).
  const offset = useSharedValue(0);
  const barSpacing = useSharedValue(DEFAULT_BAR_SPACING);
  const dataLen = useSharedValue(0);
  const crosshairX = useSharedValue(-1);
  const crosshairY = useSharedValue(-1);
  // The recorded frame the canvas shows.
  const blank = useMemo(() => createPicture(noop), []);
  const picture = useSharedValue<SkPicture>(blank);

  // Everything redraw() reads, refreshed every render (it runs outside render).
  const latest = useRef({
    props,
    theme,
    font,
    width,
    height,
    plotWidth,
    plotHeight,
  });
  latest.current = { props, theme, font, width, height, plotWidth, plotHeight };

  // JS-side truth for data + view. `viewRef` is written together with every JS
  // write to the shared values and mirrored from gestures, so it is never stale.
  const columnsRef = useRef<CandleColumns | null>(null);
  const viewRef = useRef({ offset: 0, barSpacing: DEFAULT_BAR_SPACING });
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const positioned = useRef(false);
  // Lazy-history loading state.
  const loadingOlder = useRef(false);
  const hasMoreHistory = useRef(true);
  const loadGenRef = useRef(0);

  const setOffset = useCallback(
    (o: number) => {
      offset.value = o;
      viewRef.current = { ...viewRef.current, offset: o };
    },
    [offset]
  );

  // --- Redraw scheduling: coalesce every trigger into ≤ 1 redraw per frame.
  const redrawFrame = useRef<number | null>(null);
  const redrawRef = useRef<() => void>(noop);
  const requestRedraw = useCallback(() => {
    if (redrawFrame.current !== null) return;
    redrawFrame.current = requestAnimationFrame(() => {
      redrawFrame.current = null;
      redrawRef.current();
    });
  }, []);
  useEffect(
    () => () => {
      if (redrawFrame.current !== null) {
        cancelAnimationFrame(redrawFrame.current);
      }
    },
    []
  );

  const commitColumns = useCallback(
    (next: CandleColumns) => {
      columnsRef.current = next;
      dataLen.value = next.times.length;
      setDataState(next.times.length > 0 ? 'ready' : 'empty');
      requestRedraw();
    },
    [dataLen, requestRedraw]
  );

  // Live-edge following: if the newest of `len` bars is on screen, a grow should
  // keep it there.
  const isAtLiveEdge = useCallback((len: number): boolean => {
    const { offset: o, barSpacing: bs } = viewRef.current;
    const w = latest.current.plotWidth;
    if (bs <= 0 || w <= 0) return false;
    return o + w / bs >= len - 1;
  }, []);
  const snapToLiveEdge = useCallback(
    (len: number) => {
      const bs = viewRef.current.barSpacing;
      const w = latest.current.plotWidth;
      if (bs <= 0 || w <= 0) return;
      setOffset(Math.max(0, len - Math.floor(w / bs)));
    },
    [setOffset]
  );

  // Live updates (Stage 4–5) are queued and folded in once per animation frame.
  // Time-keyed, so backfill↔live merges correctly (see `applyUpdates`).
  const pendingUpdates = useRef<CandleUpdate[]>([]);
  const flushFrame = useRef<number | null>(null);
  const flushUpdates = useCallback(() => {
    flushFrame.current = null;
    const queue = pendingUpdates.current;
    pendingUpdates.current = [];
    const prev = columnsRef.current ?? candlesToColumns([]);
    const prevLen = prev.times.length;
    const r = applyUpdates(prev, queue);
    if (r.unchanged) return;
    if (r.replaced) {
      positioned.current = false;
    } else if (r.appended > 0 && isAtLiveEdge(prevLen)) {
      snapToLiveEdge(r.cols.times.length);
    }
    commitColumns(r.cols);
  }, [commitColumns, isAtLiveEdge, snapToLiveEdge]);
  const enqueueUpdate = useCallback(
    (u: CandleUpdate) => {
      pendingUpdates.current.push(u);
      if (flushFrame.current === null) {
        flushFrame.current = requestAnimationFrame(flushUpdates);
      }
    },
    [flushUpdates]
  );
  const dropPendingUpdates = useCallback(() => {
    if (flushFrame.current !== null) cancelAnimationFrame(flushFrame.current);
    flushFrame.current = null;
    pendingUpdates.current = [];
  }, []);

  // Load history, then subscribe for live patch/append updates.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    setLoadError(false);
    setStatus('connecting');
    // Reset lazy-history for the new symbol/interval (invalidate in-flight loads).
    loadGenRef.current += 1;
    hasMoreHistory.current = true;
    loadingOlder.current = false;
    const gen = loadGenRef.current;

    // Reconnect gap fill: once the stream has dropped, the next `open` re-fetches
    // the latest page and merges it by time — inserting bars missed while down,
    // even if live bars already landed past the gap (TECH_PLAN C.3 #2).
    let dropped = false;
    const backfillGap = () => {
      adapter
        .fetchHistory({
          symbol,
          interval,
          limit: HISTORY_PAGE_SIZE,
          signal: controller.signal,
        })
        .then((recent) => {
          const prev = columnsRef.current;
          if (cancelled || gen !== loadGenRef.current || !prev) return;
          const m = mergeRecent(prev, recent, interval);
          if (m.mode === 'noop') return;
          if (m.mode === 'replace') {
            positioned.current = false; // outage outlasted a page — re-fit
          } else if (isAtLiveEdge(prev.times.length)) {
            snapToLiveEdge(m.cols.times.length);
          } else {
            // Keep the bars on screen put: shift by inserts left of the view.
            const left = viewRef.current.offset;
            const shift = m.insertedAt.filter((i) => i < left).length;
            if (shift > 0) setOffset(left + shift);
          }
          commitColumns(m.cols);
        })
        .catch(() => {
          // transient — the next reconnect retries
        });
    };

    adapter
      .fetchHistory({ symbol, interval, signal: controller.signal })
      .then((candles) => {
        if (cancelled) return;
        positioned.current = false;
        commitColumns(candlesToColumns(candles));
        unsubscribe = adapter.subscribe({
          symbol,
          interval,
          onUpdate: (u) => {
            if (!cancelled) enqueueUpdate(u);
          },
          onStatus: (st) => {
            if (cancelled) return;
            setStatus(st);
            if (st === 'reconnecting' || st === 'error' || st === 'closed') {
              dropped = true;
            } else if (st === 'open' && dropped) {
              dropped = false;
              backfillGap();
            }
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      unsubscribe?.();
      dropPendingUpdates();
    };
  }, [
    adapter,
    symbol,
    interval,
    reloadKey,
    setOffset,
    commitColumns,
    enqueueUpdate,
    dropPendingUpdates,
    isAtLiveEdge,
    snapToLiveEdge,
  ]);

  // Lazy history — fetch + prepend older bars when the user scrolls near the start.
  const loadOlder = useCallback(async () => {
    const cols = columnsRef.current;
    if (
      loadingOlder.current ||
      !hasMoreHistory.current ||
      !cols ||
      cols.times.length === 0
    ) {
      return;
    }
    const oldest = cols.times[0]!;
    const gen = loadGenRef.current;
    loadingOlder.current = true;
    try {
      const older = await adapter.fetchHistory({
        symbol,
        interval,
        endTime: oldest - 1,
        limit: HISTORY_PAGE_SIZE,
      });
      if (gen !== loadGenRef.current) return; // symbol/interval switched — discard
      const added = older.filter((c) => c.time < oldest).length;
      if (added === 0) {
        hasMoreHistory.current = false;
        return;
      }
      // Prepend, then shift the viewport by the added count so it stays put.
      const now = columnsRef.current;
      if (!now) return;
      setOffset(viewRef.current.offset + added);
      commitColumns(prependColumns(now, older));
      if (older.length < HISTORY_PAGE_SIZE) hasMoreHistory.current = false;
    } catch {
      // transient — retried on the next edge hit
    } finally {
      if (gen === loadGenRef.current) loadingOlder.current = false;
    }
  }, [adapter, symbol, interval, setOffset, commitColumns]);
  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;

  // Study caches: built-ins are incremental (a live tick recomputes only the
  // last bar); custom studies get their previous state while data only grew.
  // Both recompute only when the columns object changes — not on pan frames.
  const builtin = useRef<{
    engine: BuiltinStudies;
    cols: CandleColumns | null;
    value: BuiltinSeries | null;
  }>({ engine: new BuiltinStudies(), cols: null, value: null });
  const custom = useRef<{
    cols: CandleColumns | null;
    descriptors: ChartProps['studies'];
    mark: ColumnsMark | null;
    runs: Map<string, StudyRun> | null;
  }>({ cols: null, descriptors: undefined, mark: null, runs: null });

  // Public callbacks, fired from redraw() (deduped / throttled).
  const lastCross = useRef<{ index: number; close: number } | null>(null);
  const lastViewport = useRef<Viewport | null>(null);
  const viewportThrottle = useMemo(
    () =>
      throttleTrailing<Viewport>(
        (v) => latest.current.props.onViewportChange?.(v),
        VIEWPORT_CHANGE_THROTTLE_MS
      ),
    []
  );
  useEffect(() => () => viewportThrottle.cancel(), [viewportThrottle]);

  redrawRef.current = () => {
    const L = latest.current;
    const p = L.props;
    const cols = columnsRef.current;
    const len = cols?.times.length ?? 0;

    // Position at the live edge once data + size are known.
    if (cols && len > 0 && L.plotWidth > 0 && !positioned.current) {
      const init = initialViewport(len, L.plotWidth, DEFAULT_BAR_SPACING);
      barSpacing.value = init.barSpacing;
      viewRef.current = { offset: init.offset, barSpacing: init.barSpacing };
      offset.value = init.offset;
      positioned.current = true;
    }
    const view = viewRef.current;

    let studies: BuiltinSeries | null = null;
    let customRuns: Map<string, StudyRun> | null = null;
    if (cols && len > 0) {
      const b = builtin.current;
      if (b.cols !== cols) {
        b.value = b.engine.update(cols);
        b.cols = cols;
      }
      studies = b.value;
      const descriptors = p.studies ?? EMPTY_STUDIES;
      const cu = custom.current;
      if (descriptors.length === 0) {
        custom.current = { cols, descriptors, mark: null, runs: null };
      } else if (cu.cols !== cols || cu.descriptors !== descriptors) {
        const runs = runStudies(
          descriptors,
          columnsToView(cols),
          cu.runs,
          studyNeedsReset(cu.mark, cols)
        );
        custom.current = { cols, descriptors, mark: markColumns(cols), runs };
      }
      customRuns = custom.current.runs;
    }

    const frame =
      cols && len > 0
        ? buildFrame({
            columns: cols,
            view,
            plotWidth: L.plotWidth,
            plotHeight: L.plotHeight,
            logScale: p.logScale ?? false,
            studies,
            customRuns,
            activeStudies: p.activeStudies ?? DEFAULT_ACTIVE_STUDIES,
            chartType: p.chartType ?? 'candlestick',
            theme: L.theme,
            pricePrecision: p.symbol.pricePrecision,
            priceLines: p.priceLines ?? EMPTY_PRICE_LINES,
            markers: p.markers ?? EMPTY_MARKERS,
            drawings: p.drawings ?? EMPTY_DRAWINGS,
          })
        : null;
    const cross = buildCross(pointerRef.current, frame, cols, view);

    if (L.width > 0 && L.height > 0) {
      picture.value = createPicture(
        (canvas) =>
          drawScene(canvas, {
            width: L.width,
            height: L.height,
            plotWidth: L.plotWidth,
            plotHeight: L.plotHeight,
            theme: L.theme,
            font: L.font,
            frame,
            cross,
            pricePrecision: p.symbol.pricePrecision,
          }),
        { width: L.width, height: L.height }
      );
    }

    // onCrosshairMove — when the hovered bar (or its live values) changes.
    if (p.onCrosshairMove) {
      const now = cross
        ? { index: cross.index, close: cross.ohlcv.close }
        : null;
      const was = lastCross.current;
      if (
        (now === null) !== (was === null) ||
        (now && was && (now.index !== was.index || now.close !== was.close))
      ) {
        if (cross) {
          const bar: Candle = {
            time: cross.time,
            open: cross.ohlcv.open,
            high: cross.ohlcv.high,
            low: cross.ohlcv.low,
            close: cross.ohlcv.close,
            volume: cross.ohlcv.volume,
          };
          p.onCrosshairMove(bar, cross.index);
        } else {
          p.onCrosshairMove(null, -1);
        }
      }
      lastCross.current = now;
    }

    // onViewportChange — throttled, only when the viewport actually changed.
    if (
      p.onViewportChange &&
      positioned.current &&
      len > 0 &&
      L.plotWidth > 0
    ) {
      const v = toViewport(
        view.offset,
        view.barSpacing,
        L.plotWidth,
        len,
        p.logScale ?? false
      );
      const w = lastViewport.current;
      if (
        !w ||
        w.offset !== v.offset ||
        w.barSpacing !== v.barSpacing ||
        w.pinnedToNow !== v.pinnedToNow ||
        w.logScale !== v.logScale
      ) {
        lastViewport.current = v;
        viewportThrottle.call(v);
      }
    }

    // Lazy history when the left edge approaches the oldest loaded bar — only
    // once positioned (the pre-positioning offset 0 is not a real view).
    if (
      positioned.current &&
      len > 0 &&
      view.offset <= EDGE_LOAD_BARS &&
      !loadingOlder.current &&
      hasMoreHistory.current
    ) {
      loadOlderRef.current();
    }
  };

  // Any React render (props / size / status) → repaint with the new inputs.
  useEffect(() => {
    requestRedraw();
  });

  // Gestures and the crosshair drive redraws directly — no React state.
  const onGestureView = useCallback(
    (o: number, b: number) => {
      viewRef.current = { offset: o, barSpacing: b };
      requestRedraw();
    },
    [requestRedraw]
  );
  const onPointer = useCallback(
    (x: number, y: number) => {
      pointerRef.current = x < 0 ? null : { x, y };
      requestRedraw();
    },
    [requestRedraw]
  );
  useAnimatedReaction(
    () => ({ o: offset.value, b: barSpacing.value }),
    (cur, prev) => {
      if (!prev || cur.o !== prev.o || cur.b !== prev.b) {
        runOnJS(onGestureView)(cur.o, cur.b);
      }
    }
  );
  useAnimatedReaction(
    () => ({ x: crosshairX.value, y: crosshairY.value }),
    (cur, prev) => {
      if (prev && cur.x === prev.x && cur.y === prev.y) return;
      runOnJS(onPointer)(cur.x, cur.y);
    }
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize({ width: w, height: h });
  };

  const gesture = useChartGestures({
    offset,
    barSpacing,
    dataLen,
    plotWidth,
    crosshairX,
    crosshairY,
    onSettle: noop,
  });

  const statusLabel = STATUS_LABEL[status];
  const statusDotColor =
    status === 'open'
      ? theme.upColor
      : status === 'connecting' || status === 'reconnecting'
        ? '#f0b90b'
        : status === 'error' || status === 'closed'
          ? theme.downColor
          : theme.axisTextColor;

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.fill, style]} onLayout={onLayout}>
        {width > 0 && height > 0 && (
          <Canvas style={styles.fill}>
            <Picture picture={picture} />
          </Canvas>
        )}

        {/* Connection-status chip (sits just left of the price axis). */}
        {dataState === 'ready' && (
          <View
            style={[styles.statusChip, { right: PRICE_AXIS_WIDTH + 8 }]}
            pointerEvents="none"
          >
            <View
              style={[styles.statusDot, { backgroundColor: statusDotColor }]}
            />
            <RNText style={[styles.statusText, { color: theme.axisTextColor }]}>
              {statusLabel}
            </RNText>
          </View>
        )}

        {/* States: error (with retry) / loading / empty. */}
        {loadError ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <RNText
              style={[styles.overlayText, { color: theme.axisTextColor }]}
            >
              Couldn&apos;t load {symbol.displayName}.
            </RNText>
            <Pressable
              onPress={() => setReloadKey((k) => k + 1)}
              style={[styles.retryBtn, { borderColor: theme.axisLineColor }]}
            >
              <RNText
                style={[styles.retryText, { color: theme.crosshairLabelText }]}
              >
                Retry
              </RNText>
            </Pressable>
          </View>
        ) : dataState === 'loading' ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={theme.axisTextColor} />
            <RNText
              style={[styles.overlayText, { color: theme.axisTextColor }]}
            >
              Loading…
            </RNText>
          </View>
        ) : dataState === 'empty' ? (
          <View style={styles.overlay} pointerEvents="none">
            <RNText
              style={[styles.overlayText, { color: theme.axisTextColor }]}
            >
              No data
            </RNText>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: { fontSize: 14, fontWeight: '500' },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  retryText: { fontSize: 13, fontWeight: '600' },
  statusChip: {
    position: 'absolute',
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
});
