/**
 * Imperative scene drawing for `<Chart/>` (M5). Records one frame into an
 * SkPicture that the canvas shows via a shared value — so pan, zoom, crosshair
 * and live ticks repaint without a React render (the per-frame reconciliation
 * and element garbage were the remaining JS cost at 10k–50k bars).
 *
 * Draw order and styling match the declarative tree this replaced.
 */

import { ClipOp, PaintStyle, Skia } from '@shopify/react-native-skia';
import type {
  SkCanvas,
  SkFont,
  SkPaint,
  SkPath,
} from '@shopify/react-native-skia';
import type { ChartTheme } from '../types';
import { formatCompact, formatPrice, formatTimeLabel } from '../core';
import {
  LEGEND_STEP,
  MARKER_SIZE,
  PANE_PADDING_Y,
  PRICE_AXIS_WIDTH,
  PRICE_LABEL_HIDE_GAP,
  SERIES_AREA_ALPHA,
  SERIES_LINE_COLOR,
  TIME_AXIS_HEIGHT,
  VOLUME_OVERLAY_ALPHA,
  withAlpha,
} from './frame';
import type { Cross, Frame, OHLCV } from './frame';

export interface SceneInput {
  width: number;
  height: number;
  plotWidth: number;
  plotHeight: number;
  theme: ChartTheme;
  font: SkFont | null;
  frame: Frame | null;
  cross: Cross | null;
  pricePrecision: number;
}

// Paints are reused across frames (keyed by color / style / width) so a frame
// allocates no paint objects.
const paints = new Map<string, SkPaint>();
function paint(color: string, strokeWidth = 0): SkPaint {
  const key = `${color}|${strokeWidth}`;
  let p = paints.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(color));
    if (strokeWidth > 0) {
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(strokeWidth);
    }
    if (paints.size > 256) paints.clear(); // themes churn — keep it bounded
    paints.set(key, p);
  }
  return p;
}
const fill = (c: string) => paint(c);
const stroke = (c: string, w: number) => paint(c, w);

function clip(c: SkCanvas, x: number, y: number, w: number, h: number): void {
  c.clipRect(
    Skia.XYWHRect(x, y, Math.max(0, w), Math.max(0, h)),
    ClipOp.Intersect,
    true
  );
}

function hline(c: SkCanvas, y: number, w: number, p: SkPaint): void {
  c.drawLine(0, y, w, y, p);
}

function text(
  c: SkCanvas,
  s: string,
  x: number,
  y: number,
  color: string,
  font: SkFont | null
): void {
  if (font) c.drawText(s, x, y, fill(color), font);
}

function path(c: SkCanvas, p: SkPath, pt: SkPaint): void {
  c.drawPath(p, pt);
}

export function drawScene(c: SkCanvas, s: SceneInput): void {
  const { width, height, plotWidth, plotHeight, theme, font, frame, cross } = s;

  c.drawRect(Skia.XYWHRect(0, 0, width, height), fill(theme.background));

  if (frame) {
    for (const t of frame.priceTicks) {
      hline(c, t.y, plotWidth, stroke(theme.gridColor, 1));
    }
  }
  // Right axis line (spans every pane) + time-axis top border.
  c.drawLine(
    plotWidth,
    0,
    plotWidth,
    plotHeight,
    stroke(theme.axisLineColor, 1)
  );
  hline(c, plotHeight, plotWidth, stroke(theme.axisLineColor, 1));
  if (!frame) return;

  // Sub-pane separators (before series so series sit on top).
  for (const p of frame.subPanes) {
    hline(c, p.top, plotWidth, stroke(theme.paneSeparatorColor, 1));
  }

  // --- Price pane (clipped).
  c.save();
  clip(c, 0, 0, plotWidth, frame.pricePaneHeight);
  if (frame.volume) {
    path(
      c,
      frame.volume.upBars,
      fill(withAlpha(theme.upColor, VOLUME_OVERLAY_ALPHA))
    );
    path(
      c,
      frame.volume.downBars,
      fill(withAlpha(theme.downColor, VOLUME_OVERLAY_ALPHA))
    );
  }
  const series = frame.series;
  if (series.kind === 'candlestick') {
    const g = series.geometry;
    path(c, g.upWicks, stroke(theme.wickUpColor, 1));
    path(c, g.downWicks, stroke(theme.wickDownColor, 1));
    path(c, g.upBodies, fill(theme.upColor));
    path(c, g.downBodies, fill(theme.downColor));
    if (theme.borderVisible) {
      path(c, g.upBodies, stroke(theme.borderUpColor, 1));
      path(c, g.downBodies, stroke(theme.borderDownColor, 1));
    }
  } else if (series.kind === 'bar') {
    path(c, series.upBars, stroke(theme.upColor, 1.25));
    path(c, series.downBars, stroke(theme.downColor, 1.25));
  } else if (series.kind === 'line') {
    path(c, series.line, stroke(SERIES_LINE_COLOR, 2));
  } else if (series.kind === 'area') {
    path(c, series.area, fill(withAlpha(SERIES_LINE_COLOR, SERIES_AREA_ALPHA)));
    path(c, series.line, stroke(SERIES_LINE_COLOR, 2));
  } else {
    // Baseline: two-tone — up colour above the baseline, down colour below.
    c.save();
    clip(c, 0, 0, plotWidth, series.baselineY);
    path(c, series.fill, fill(withAlpha(theme.upColor, SERIES_AREA_ALPHA)));
    path(c, series.line, stroke(theme.upColor, 2));
    c.restore();
    c.save();
    clip(
      c,
      0,
      series.baselineY,
      plotWidth,
      frame.pricePaneHeight - series.baselineY
    );
    path(c, series.fill, fill(withAlpha(theme.downColor, SERIES_AREA_ALPHA)));
    path(c, series.line, stroke(theme.downColor, 2));
    c.restore();
    hline(c, series.baselineY, plotWidth, stroke(theme.axisLineColor, 1));
  }
  for (const ov of frame.overlays) {
    path(c, ov.path, stroke(ov.color, ov.strokeWidth));
  }
  for (const pic of frame.customOverlays) c.drawPicture(pic);
  c.restore();

  // --- Sub-panes: each at its y-origin, clipped to its inner area.
  for (const p of frame.subPanes) {
    c.save();
    c.translate(0, p.top + PANE_PADDING_Y);
    c.save();
    clip(c, 0, 0, plotWidth, p.height - PANE_PADDING_Y * 2);
    for (const g of p.guides) hline(c, g.y, plotWidth, stroke(g.color, 1));
    for (const h of p.histograms) path(c, h.path, fill(h.color));
    for (const l of p.lines) path(c, l.path, stroke(l.color, l.strokeWidth));
    if (p.picture) c.drawPicture(p.picture);
    c.restore();
    text(c, p.title, 6, 12, theme.axisTextColor, font);
    for (const lb of p.labels) {
      text(c, lb.text, plotWidth + 4, lb.y, theme.axisTextColor, font);
    }
    c.restore();
  }

  // --- Axis labels, under the live-price tag + crosshair. The price label
  // nearest the live tag is hidden so the tag reads cleanly.
  for (const t of frame.priceTicks) {
    if (Math.abs(t.y - frame.lastY) < PRICE_LABEL_HIDE_GAP) continue;
    text(c, t.label, plotWidth + 4, t.y + 4, theme.axisTextColor, font);
  }
  for (const t of frame.timeTicks) {
    text(c, t.label, t.x - 16, plotHeight + 16, theme.axisTextColor, font);
  }

  // --- Price lines.
  for (const g of frame.priceLineGeoms) {
    const color = g.line.color ?? theme.crosshairColor;
    hline(c, g.y, plotWidth, stroke(color, g.line.lineWidth ?? 1));
    c.drawRect(
      Skia.XYWHRect(plotWidth, g.y - 8, PRICE_AXIS_WIDTH, 16),
      fill(color)
    );
    text(c, g.title, plotWidth + 4, g.y + 4, theme.crosshairLabelText, font);
  }

  // --- Markers + drawings (clipped to the price pane).
  if (frame.markerGeoms.length > 0 || frame.drawingGeoms.length > 0) {
    c.save();
    clip(c, 0, 0, plotWidth, frame.pricePaneHeight);
    for (const m of frame.markerGeoms) {
      const color = m.color ?? theme.crosshairColor;
      if (m.shape === 'circle') {
        c.drawCircle(m.x, m.y, MARKER_SIZE, fill(color));
      } else if (m.shape === 'square') {
        c.drawRect(
          Skia.XYWHRect(
            m.x - MARKER_SIZE,
            m.y - MARKER_SIZE,
            MARKER_SIZE * 2,
            MARKER_SIZE * 2
          ),
          fill(color)
        );
      }
      if (m.path) path(c, m.path, fill(color));
      if (m.text) text(c, m.text, m.x + MARKER_SIZE + 2, m.y + 3, color, font);
    }
    for (const d of frame.drawingGeoms) {
      if (d.kind === 'h') hline(c, d.y, plotWidth, stroke(d.color, 1.5));
      else c.drawLine(d.x1, d.y1, d.x2, d.y2, stroke(d.color, 1.5));
    }
    c.restore();
  }

  // --- Last-price line + tag. The tag is clamped inside the price pane; the
  // line hides when the latest price is outside the visible range.
  const lastColor = frame.last.up
    ? theme.lastPriceUpColor
    : theme.lastPriceDownColor;
  if (frame.lastY >= 0 && frame.lastY <= frame.pricePaneHeight) {
    hline(c, frame.lastY, plotWidth, stroke(lastColor, 1));
  }
  const lastTagY = Math.max(
    8,
    Math.min(frame.pricePaneHeight - 8, frame.lastY)
  );
  c.drawRect(
    Skia.XYWHRect(plotWidth, lastTagY - 8, PRICE_AXIS_WIDTH, 16),
    fill(lastColor)
  );
  text(
    c,
    formatPrice(frame.last.close, s.pricePrecision),
    plotWidth + 4,
    lastTagY + 4,
    theme.crosshairLabelText,
    font
  );

  // --- Crosshair: the vertical line spans every pane; the horizontal line/tag
  // only while the pointer is over the price pane.
  if (cross) {
    c.drawLine(
      cross.x,
      0,
      cross.x,
      plotHeight,
      stroke(theme.crosshairColor, 1)
    );
    if (cross.inPricePane) {
      hline(c, cross.y, plotWidth, stroke(theme.crosshairColor, 1));
      c.drawRect(
        Skia.XYWHRect(plotWidth, cross.y - 8, PRICE_AXIS_WIDTH, 16),
        fill(theme.crosshairLabelBackground)
      );
      text(
        c,
        formatPrice(cross.price, s.pricePrecision),
        plotWidth + 4,
        cross.y + 4,
        theme.crosshairLabelText,
        font
      );
    }
    c.drawRect(
      Skia.XYWHRect(cross.x - 24, plotHeight, 48, TIME_AXIS_HEIGHT),
      fill(theme.crosshairLabelBackground)
    );
    text(
      c,
      formatTimeLabel(cross.time),
      cross.x - 16,
      plotHeight + 16,
      theme.crosshairLabelText,
      font
    );
  }

  // --- OHLCV legend (top-left): the hovered bar, else the latest.
  const legend: OHLCV = cross ? cross.ohlcv : frame.last;
  const p = s.pricePrecision;
  const segments: [string, string, string][] = [
    ['O', formatPrice(legend.open, p), theme.axisTextColor],
    ['H', formatPrice(legend.high, p), theme.axisTextColor],
    ['L', formatPrice(legend.low, p), theme.axisTextColor],
    [
      'C',
      formatPrice(legend.close, p),
      legend.up ? theme.upColor : theme.downColor,
    ],
    ['V', formatCompact(legend.volume), theme.axisTextColor],
  ];
  segments.forEach(([k, v, color], i) => {
    text(c, `${k} ${v}`, 8 + i * LEGEND_STEP, 16, color, font);
  });
}
