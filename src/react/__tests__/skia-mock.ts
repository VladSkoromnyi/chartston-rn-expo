/**
 * Minimal `@shopify/react-native-skia` stand-in for the jest suite. Instead of
 * rasterising, `createPicture` records draw calls; `latestScene()` returns the
 * ops of the last full-chart frame so tests can assert what was drawn.
 */

import { createElement } from 'react';
import { View } from 'react-native';
import type { ReactNode } from 'react';

export type Op =
  | { op: 'text'; text: string; x: number; y: number; color: string }
  | { op: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | {
      op: 'line';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      color: string;
    }
  | { op: 'path'; color: string; stroke: boolean; points: number }
  | { op: 'picture'; ops: Op[] }
  | { op: 'circle'; color: string }
  | { op: 'save' | 'restore' | 'clip' | 'translate' };

interface Paint {
  color: string;
  stroke: boolean;
  setAntiAlias(): void;
  setColor(c: string): void;
  setStyle(s: number): void;
  setStrokeWidth(): void;
}

class FakePath {
  points = 0;
  moveTo() {
    this.points++;
    return this;
  }
  lineTo() {
    this.points++;
    return this;
  }
  addRect() {
    this.points += 4;
    return this;
  }
  close() {
    return this;
  }
  copy() {
    const p = new FakePath();
    p.points = this.points;
    return p;
  }
  detach() {
    return this;
  }
  countPoints() {
    return this.points;
  }
}

class RecordingCanvas {
  ops: Op[] = [];
  drawRect(
    r: { x: number; y: number; width: number; height: number },
    p: Paint
  ) {
    this.ops.push({
      op: 'rect',
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      color: p.color,
    });
  }
  drawLine(x0: number, y0: number, x1: number, y1: number, p: Paint) {
    this.ops.push({ op: 'line', x0, y0, x1, y1, color: p.color });
  }
  drawPath(path: FakePath, p: Paint) {
    this.ops.push({
      op: 'path',
      color: p.color,
      stroke: p.stroke,
      points: path.points,
    });
  }
  drawText(text: string, x: number, y: number, p: Paint) {
    this.ops.push({ op: 'text', text, x, y, color: p.color });
  }
  drawCircle(_x: number, _y: number, _r: number, p: Paint) {
    this.ops.push({ op: 'circle', color: p.color });
  }
  drawPicture(pic: { ops: Op[] }) {
    this.ops.push({ op: 'picture', ops: pic.ops });
  }
  save() {
    this.ops.push({ op: 'save' });
  }
  restore() {
    this.ops.push({ op: 'restore' });
  }
  clipRect() {
    this.ops.push({ op: 'clip' });
  }
  translate() {
    this.ops.push({ op: 'translate' });
  }
}

let latest: Op[] = [];
let pictures = 0;

/** Ops of the most recent full-chart frame (the one drawn at canvas size). */
export function latestScene(): Op[] {
  return latest;
}
export function pictureCount(): number {
  return pictures;
}
export function resetScene(): void {
  latest = [];
  pictures = 0;
}

export function createPicture(
  cb: (c: RecordingCanvas) => void,
  rect?: { width: number; height: number }
): { ops: Op[] } {
  const c = new RecordingCanvas();
  cb(c);
  pictures++;
  // Full-chart frames start with the background rect at the canvas size.
  const first = c.ops[0];
  if (
    rect &&
    first?.op === 'rect' &&
    first.w === rect.width &&
    first.h === rect.height
  ) {
    latest = c.ops;
  }
  return { ops: c.ops };
}

export const ClipOp = { Difference: 0, Intersect: 1 };
export const PaintStyle = { Fill: 0, Stroke: 1 };

export const Skia = {
  Paint: (): Paint => ({
    color: '',
    stroke: false,
    setAntiAlias() {},
    setColor(c: string) {
      this.color = c;
    },
    setStyle(s: number) {
      this.stroke = s === 1;
    },
    setStrokeWidth() {},
  }),
  Color: (c: string) => c,
  XYWHRect: (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  }),
  Path: { Make: () => new FakePath() },
  PathBuilder: {
    Make: () => new FakePath(),
    MakeFromPath: (p: FakePath) => p.copy(),
  },
};

export function matchFont() {
  return {};
}

export function Canvas(props: { children?: ReactNode }) {
  return createElement(View, { testID: 'chart-canvas' }, props.children);
}
export function Picture() {
  return null;
}
