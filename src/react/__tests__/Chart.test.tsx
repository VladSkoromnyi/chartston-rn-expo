/**
 * <Chart/> integration tests: a controllable feed adapter → the real data
 * pipeline (history, batching, gap fill, studies, frame build, scene) → the
 * recorded draw calls and public callbacks. Gestures and the crosshair run on
 * the UI thread and are covered by qa/gestures.md.
 */

import { describe, expect, it } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Skia } from '@shopify/react-native-skia';
import { Chart } from '../Chart';
import type {
  Candle,
  CandleUpdate,
  ChartProps,
  FetchHistoryRequest,
  MarketFeedAdapter,
  StudyDescriptor,
  SubscribeRequest,
  SymbolInfo,
  Viewport,
} from '../../types';
import { latestScene, resetScene } from './skia-mock';
import type { Op } from './skia-mock';

const M = 60_000;
const T0 = Date.UTC(2026, 9, 1);
// 400 × 600 layout → 344 px plot → 43 bars visible at the default 8 px spacing.
const LAYOUT = { nativeEvent: { layout: { width: 400, height: 600 } } };

const SYMBOL: SymbolInfo = {
  id: 'TEST',
  base: 'T',
  quote: 'USD',
  displayName: 'TEST / USD',
  pricePrecision: 2,
  qtyPrecision: 2,
};

const bar = (i: number, close = 100 + i): Candle => ({
  time: T0 + i * M,
  open: close - 0.5,
  high: close + 1,
  low: close - 1,
  close,
  volume: 10,
});
const bars = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, k) => bar(from + k));

/** A feed the test drives by hand. */
class FakeFeed implements MarketFeedAdapter {
  readonly name = 'fake';
  fetches: FetchHistoryRequest[] = [];
  subs: SubscribeRequest[] = [];
  unsubscribed = 0;
  constructor(
    public history: (req: FetchHistoryRequest) => Promise<Candle[]>
  ) {}
  fetchHistory(req: FetchHistoryRequest) {
    this.fetches.push(req);
    return this.history(req);
  }
  subscribe(req: SubscribeRequest) {
    this.subs.push(req);
    req.onStatus?.('open');
    return () => {
      this.unsubscribed++;
    };
  }
  emit(u: CandleUpdate) {
    this.subs[this.subs.length - 1]!.onUpdate(u);
  }
  status(s: Parameters<NonNullable<SubscribeRequest['onStatus']>>[0]) {
    this.subs[this.subs.length - 1]!.onStatus?.(s);
  }
}

/** Let promises, rAF-scheduled flushes and redraws run. */
async function settle(ms = 40) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function mount(
  props: Partial<ChartProps> & { adapter: MarketFeedAdapter }
) {
  resetScene();
  const utils = render(<Chart symbol={SYMBOL} interval="1m" {...props} />);
  fireEvent(screen.getByTestId('chartston-chart'), 'layout', LAYOUT);
  await settle();
  return utils;
}

const texts = (ops: Op[] = latestScene()): string[] =>
  ops.flatMap((o) =>
    o.op === 'text' ? [o.text] : o.op === 'picture' ? texts(o.ops) : []
  );
const legendClose = () => texts().find((t) => t.startsWith('C '));

describe('<Chart/> data pipeline', () => {
  it('shows Loading…, then draws the history with the latest bar in the legend', async () => {
    let resolve!: (c: Candle[]) => void;
    const feed = new FakeFeed(() => new Promise((r) => (resolve = r)));
    resetScene();
    render(<Chart symbol={SYMBOL} interval="1m" adapter={feed} />);
    fireEvent(screen.getByTestId('chartston-chart'), 'layout', LAYOUT);
    expect(screen.getByText('Loading…')).toBeTruthy();

    await act(async () => resolve(bars(0, 100)));
    await settle();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(legendClose()).toBe('C 199.00');
    // Built-in panes are drawn with their titles.
    expect(texts()).toEqual(expect.arrayContaining(['RSI 14', 'MACD 12 26 9']));
  });

  it('opens at the live edge without paging extra history', async () => {
    const feed = new FakeFeed(async () => bars(0, 100));
    const seen: Viewport[] = [];
    await mount({ adapter: feed, onViewportChange: (v) => seen.push(v) });
    expect(seen[0]).toMatchObject({ offset: 57, pinnedToNow: true });
    expect(seen.some((v) => v.offset === 0)).toBe(false);
    expect(feed.fetches).toHaveLength(1);
  });

  it('patches the live bar and follows appends at the live edge', async () => {
    const feed = new FakeFeed(async () => bars(0, 100));
    const seen: Viewport[] = [];
    await mount({ adapter: feed, onViewportChange: (v) => seen.push(v) });

    await act(async () => feed.emit({ type: 'patch', candle: bar(99, 250) }));
    await settle();
    expect(legendClose()).toBe('C 250.00');

    await act(async () => feed.emit({ type: 'append', candle: bar(100, 251) }));
    await settle(150); // past the 100 ms viewport throttle
    expect(legendClose()).toBe('C 251.00');
    expect(seen[seen.length - 1]).toMatchObject({
      offset: 58,
      pinnedToNow: true,
    });
  });

  it('drops out-of-order ticks', async () => {
    const feed = new FakeFeed(async () => bars(0, 100));
    await mount({ adapter: feed });
    await act(async () => feed.emit({ type: 'patch', candle: bar(50, 999) }));
    await settle();
    expect(legendClose()).toBe('C 199.00');
  });

  it('fills the gap after a reconnect', async () => {
    let page: Candle[] = bars(0, 100);
    const feed = new FakeFeed(async () => page);
    const seen: Viewport[] = [];
    await mount({ adapter: feed, onViewportChange: (v) => seen.push(v) });

    // Drop, a live bar lands past the gap, then the stream reopens.
    await act(async () => feed.status('reconnecting'));
    await act(async () => feed.emit({ type: 'append', candle: bar(105) }));
    page = bars(10, 106); // REST now has the missed bars 100–104
    await act(async () => feed.status('open'));
    await settle(150);

    const backfill = feed.fetches[1]!;
    expect(backfill.endTime).toBeUndefined();
    expect(backfill.limit).toBe(500);
    // 100 history + 5 inserted + 1 live = 106 bars, still pinned to the edge.
    expect(seen[seen.length - 1]).toMatchObject({
      offset: 106 - 43,
      pinnedToNow: true,
    });
  });

  it('ignores a slow response for the previous symbol', async () => {
    const resolvers: ((c: Candle[]) => void)[] = [];
    const feed = new FakeFeed(() => new Promise((r) => resolvers.push(r)));
    const utils = await mount({ adapter: feed });
    utils.rerender(
      <Chart symbol={{ ...SYMBOL, id: 'OTHER' }} interval="1m" adapter={feed} />
    );
    await settle();
    // The new symbol answers first; the stale one arrives later.
    await act(async () =>
      resolvers[1]!(bars(0, 50).map((b) => ({ ...b, close: 7 })))
    );
    await act(async () => resolvers[0]!(bars(0, 100)));
    await settle();
    expect(legendClose()).toBe('C 7.00');
    expect(feed.subs).toHaveLength(1);
  });

  it('unsubscribes on unmount', async () => {
    const feed = new FakeFeed(async () => bars(0, 10));
    const utils = await mount({ adapter: feed });
    utils.unmount();
    expect(feed.unsubscribed).toBe(1);
  });
});

describe('<Chart/> states', () => {
  it('shows an error with Retry, and Retry reloads', async () => {
    let fail = true;
    const feed = new FakeFeed(async () => {
      if (fail) throw new Error('offline');
      return bars(0, 10);
    });
    await mount({ adapter: feed });
    expect(screen.getByText("Couldn't load TEST / USD.")).toBeTruthy();

    fail = false;
    fireEvent.press(screen.getByText('Retry'));
    await settle();
    expect(screen.queryByText("Couldn't load TEST / USD.")).toBeNull();
    expect(legendClose()).toBe('C 109.00');
  });

  it('shows No data for an empty history', async () => {
    await mount({ adapter: new FakeFeed(async () => []) });
    expect(screen.getByText('No data')).toBeTruthy();
  });
});

describe('<Chart/> props', () => {
  const lineStudy = (kind: 'overlay' | 'pane'): StudyDescriptor => ({
    id: `t-${kind}`,
    kind,
    name: `Test ${kind}`,
    inputs: {},
    compute: (c) => ({
      series: { v: Float64Array.from(c.closes) },
      scratch: {},
      lastIndex: c.length - 1,
    }),
    draw: (ctx, s) => {
      const p = Skia.PathBuilder.Make();
      for (let i = ctx.startIndex; i <= ctx.endIndex; i++) {
        p.lineTo(ctx.indexToX(i), ctx.valueToY(s.series.v![i]!));
      }
      ctx.canvas.drawPath(p.detach(), Skia.Paint());
    },
  });

  it('draws custom studies: overlays as pictures, panes with title + labels', async () => {
    const feed = new FakeFeed(async () => bars(0, 100));
    await mount({
      adapter: feed,
      studies: [lineStudy('overlay'), lineStudy('pane')],
    });
    const pics = latestScene().filter((o) => o.op === 'picture');
    expect(pics.length).toBe(2);
    expect(texts()).toEqual(
      expect.arrayContaining(['Test pane', '199.00', '157.00'])
    );
  });

  it('skips a custom study that throws instead of crashing', async () => {
    const feed = new FakeFeed(async () => bars(0, 20));
    const bad: StudyDescriptor = {
      ...lineStudy('pane'),
      compute: () => {
        throw new Error('consumer bug');
      },
    };
    await mount({ adapter: feed, studies: [bad] });
    expect(legendClose()).toBe('C 119.00');
    expect(texts()).not.toContain('Test pane');
  });

  it('draws price lines and markers', async () => {
    const feed = new FakeFeed(async () => bars(0, 100));
    await mount({
      adapter: feed,
      priceLines: [{ price: 180, title: 'target' }],
      markers: [{ time: bar(90).time, text: 'buy', shape: 'circle' }],
    });
    expect(texts()).toEqual(expect.arrayContaining(['target', 'buy']));
    expect(latestScene().some((o) => o.op === 'circle')).toBe(true);
  });

  it('repaints on a prop change without refetching', async () => {
    const feed = new FakeFeed(async () => bars(0, 100));
    const utils = await mount({ adapter: feed });
    utils.rerender(
      <Chart
        symbol={SYMBOL}
        interval="1m"
        adapter={feed}
        activeStudies={{ overlays: [], panes: [] }}
      />
    );
    await settle();
    expect(texts()).not.toContain('RSI 14');
    expect(feed.fetches).toHaveLength(1);
  });
});

describe('package entry points', () => {
  it('keeps the bottom-sheet selectors out of the root entry', () => {
    const root = require('../../index');
    expect(root.Chart).toBeDefined();
    expect(root.PeriodSelector).toBeUndefined();
    expect(root.IndicatorMenu).toBeUndefined();
  });
});
