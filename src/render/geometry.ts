import { Skia } from '@shopify/react-native-skia';
import type { SkPath, SkRect } from '@shopify/react-native-skia';

/** Pixel dimensions of a pane's plot area (PLAN §5.1). */
export interface PaneGeometry {
  width: number;
  height: number;
}

/** The path mutations the builders use, on whichever backend Skia offers. */
export interface PathDraft {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  addRect(rect: SkRect): void;
  close(): void;
  /** Finish and return the immutable path (the draft is spent). */
  done(): SkPath;
}

interface SkiaPathBuilder {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  addRect(rect: SkRect): unknown;
  close(): unknown;
  detach(): SkPath;
}
const PathBuilder = (
  Skia as unknown as {
    PathBuilder?: {
      Make(): SkiaPathBuilder;
      MakeFromPath(path: SkPath): SkiaPathBuilder;
    };
  }
).PathBuilder;

/**
 * Start a path, optionally continuing a copy of `from`. Uses `SkPathBuilder`
 * where the installed Skia has it (SkPath's own mutators are deprecated there)
 * and a mutable `SkPath` on older Skia 2.x, which the peer range still allows.
 */
export function makePath(from?: SkPath): PathDraft {
  if (PathBuilder) {
    const b = from ? PathBuilder.MakeFromPath(from) : PathBuilder.Make();
    return {
      moveTo: (x, y) => {
        b.moveTo(x, y);
      },
      lineTo: (x, y) => {
        b.lineTo(x, y);
      },
      addRect: (r) => {
        b.addRect(r);
      },
      close: () => {
        b.close();
      },
      done: () => b.detach(),
    };
  }
  const p = from ? from.copy() : Skia.Path.Make();
  return {
    moveTo: (x, y) => {
      p.moveTo(x, y);
    },
    lineTo: (x, y) => {
      p.lineTo(x, y);
    },
    addRect: (r) => {
      p.addRect(r);
    },
    close: () => {
      p.close();
    },
    done: () => p,
  };
}
