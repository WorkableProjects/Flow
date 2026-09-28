import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { StrokeElement } from './types';

export interface InkFeel {
  /** 0 = raw input, 1 = heavily smoothed; 0.5 is the default feel. */
  smoothing?: number;
  /** Constant width (no pressure or speed thinning). */
  uniform?: boolean;
}

/** Tuned for an Apple Pencil–like feel: gentle taper, responsive, smooth. */
export function strokeOptions(tool: StrokeElement['tool'], size: number, pressure: boolean, last: boolean, feel: InkFeel = {}): StrokeOptions {
  const k = Math.min(1, Math.max(0, feel.smoothing ?? 0.5));
  // Map 0–1 onto perfect-freehand's useful range, with 0.5 = the original tuning.
  const smoothing = 0.2 + k * 0.76;
  const streamline = (last ? 0.5 : 0.42) * (0.3 + k * 1.4);
  if (tool === 'highlighter') {
    return { size, thinning: 0, smoothing: Math.max(smoothing, 0.4), streamline: Math.min(0.9, streamline * 1.07), simulatePressure: false, last, start: { cap: true }, end: { cap: true } };
  }
  if (feel.uniform) {
    return { size, thinning: 0, smoothing, streamline: Math.min(0.9, streamline), simulatePressure: false, last, start: { cap: true }, end: { cap: true } };
  }
  return {
    size,
    thinning: pressure ? 0.62 : 0.5,
    smoothing,
    streamline: Math.min(0.9, streamline),
    simulatePressure: !pressure,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last,
    start: { taper: 0, cap: true },
    end: { taper: pressure ? 0 : size * 1.5, cap: true },
  };
}

/** Convert a perfect-freehand outline polygon to a smooth closed Path2D. */
export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 2) return path;
  const [x0, y0] = outline[0];
  const [x1, y1] = outline[1];
  path.moveTo(x0, y0);
  path.quadraticCurveTo(x1, y1, (x1 + outline[Math.min(2, n - 1)][0]) / 2, (y1 + outline[Math.min(2, n - 1)][1]) / 2);
  for (let i = 2; i < n - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

/** Flat [x,y,p,...] → perfect-freehand input. */
export function toInput(points: ArrayLike<number>, count = points.length): number[][] {
  const out: number[][] = new Array(Math.floor(count / 3));
  for (let i = 0, j = 0; i + 2 < count; i += 3, j++) out[j] = [points[i], points[i + 1], points[i + 2]];
  return out;
}

/** The filled outline polygon of a stroke (also used for SVG export). */
export function strokeOutline(points: ArrayLike<number>, tool: StrokeElement['tool'], size: number, pressure: boolean, last: boolean, feel?: InkFeel, count?: number): number[][] {
  return getStroke(toInput(points, count), strokeOptions(tool, size, pressure, last, feel));
}

export function strokePath(points: ArrayLike<number>, tool: StrokeElement['tool'], size: number, pressure: boolean, last: boolean, feel?: InkFeel, count?: number) {
  return outlineToPath(strokeOutline(points, tool, size, pressure, last, feel, count));
}

/** SVG path data for an outline, matching `outlineToPath`. */
export function outlineToSvg(outline: number[][]): string {
  const n = outline.length;
  if (n < 2) return '';
  const f = (v: number) => +v.toFixed(2);
  const [x0, y0] = outline[0];
  const [x1, y1] = outline[1];
  const o2 = outline[Math.min(2, n - 1)];
  let d = `M${f(x0)} ${f(y0)}Q${f(x1)} ${f(y1)} ${f((x1 + o2[0]) / 2)} ${f((y1 + o2[1]) / 2)}`;
  for (let i = 2; i < n - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    d += `Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`;
  }
  return d + 'Z';
}

/**
 * Vector stroke optimization: drop samples that don't change the shape
 * (Ramer–Douglas–Peucker, keeping pressure), and round to 1/100 unit.
 * `tol` is in world units — a fraction of a screen pixel at draw time.
 */
export function optimizePoints(points: number[], tol: number): number[] {
  const n = Math.floor(points.length / 3);
  if (n <= 2) return points.map((v) => Math.round(v * 100) / 100);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tolSq = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a * 3], ay = points[a * 3 + 1], bx = points[b * 3], by = points[b * 3 + 1];
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    let far = -1, farD = tolSq;
    for (let i = a + 1; i < b; i++) {
      const px = points[i * 3], py = points[i * 3 + 1];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx - px, cy = ay + t * dy - py;
      // Pressure changes matter too: keep samples where the width shifts.
      const pd = Math.abs(points[i * 3 + 2] - (points[a * 3 + 2] + (points[b * 3 + 2] - points[a * 3 + 2]) * t));
      const d = cx * cx + cy * cy + (pd > 0.08 ? tolSq * 4 : 0);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(points[i * 3] * 100) / 100, Math.round(points[i * 3 + 1] * 100) / 100, Math.round(points[i * 3 + 2] * 1000) / 1000);
  return out;
}

const cache = new WeakMap<StrokeElement, Path2D>();

export function cachedStrokePath(el: StrokeElement): Path2D {
  let p = cache.get(el);
  if (!p) {
    p = strokePath(el.points, el.tool, el.size, el.pressure, true, el);
    cache.set(el, p);
  }
  return p;
}
