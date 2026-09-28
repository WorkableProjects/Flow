import { layoutText, LINE_HEIGHT, type RunMeasure, type TextLayout } from './richtext';
import type { BoardElement, Camera, EquationElement, ImageElement, Rect, ShapeElement, TextElement, TextSpan, Vec } from './types';

export { LINE_HEIGHT };

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── Camera ───────────────────────────────────────────────────────────

export const screenToWorld = (cam: Camera, sx: number, sy: number): Vec => ({
  x: sx / cam.z + cam.x,
  y: sy / cam.z + cam.y,
});

export const worldToScreen = (cam: Camera, wx: number, wy: number): Vec => ({
  x: (wx - cam.x) * cam.z,
  y: (wy - cam.y) * cam.z,
});

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/** Zoom around a fixed screen point so the content under it stays put. */
export function zoomAt(cam: Camera, sx: number, sy: number, nextZ: number): Camera {
  const z = clamp(nextZ, MIN_ZOOM, MAX_ZOOM);
  const w = screenToWorld(cam, sx, sy);
  return { x: w.x - sx / z, y: w.y - sy / z, z };
}

export function viewportRect(cam: Camera, width: number, height: number): Rect {
  return { x: cam.x, y: cam.y, w: width / cam.z, h: height / cam.z };
}

/** Camera that frames `r` inside a viewport, with padding in screen px. */
export function fitRect(r: Rect, width: number, height: number, pad = 96, maxZ = 2): Camera {
  const z = clamp(Math.min((width - pad * 2) / Math.max(r.w, 1), (height - pad * 2) / Math.max(r.h, 1)), MIN_ZOOM, maxZ);
  return { x: r.x + r.w / 2 - width / 2 / z, y: r.y + r.h / 2 - height / 2 / z, z };
}

// ─── Rects ────────────────────────────────────────────────────────────

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export const pointInRect = (p: Vec, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

// ─── Element bounds (cached by identity) ──────────────────────────────

const boundsCache = new WeakMap<BoardElement, Rect>();

/** Approximate width without a DOM; the renderer swaps in canvas metrics. */
let measureRun: RunMeasure = (text, fontSize, marks, font) =>
  text.length * fontSize * (marks?.code || font === 'mono' ? 0.6 : marks?.bold ? 0.6 : 0.56);

const layouts = new WeakMap<TextElement, TextLayout>();

export function setTextMeasurer(fn: RunMeasure) {
  measureRun = fn;
}

export const getTextMeasurer = () => measureRun;

export function measureText(text: string, fontSize: number) {
  return measureSpans([{ text }], fontSize);
}

export function measureSpans(spans: TextSpan[], fontSize: number) {
  const l = layoutText({ text: spans.map((s) => s.text).join(''), spans, fontSize }, measureRun);
  return { w: l.w, h: l.h };
}

/** Sticky-note padding in world units (scales with the note). */
export const NOTE_PAD = 16;
export const notePad = (note: { w: number }) => NOTE_PAD * (note.w / 220);

/** Shared text layout (renderer, bounds, links, SVG export), cached per element. */
export function textLayout(el: TextElement): TextLayout {
  let l = layouts.get(el);
  if (!l) {
    const maxW = el.note ? el.note.w - notePad(el.note) * 2 : Infinity;
    l = layoutText(el, measureRun, maxW);
    layouts.set(el, l);
  }
  return l;
}

/** Content-box origin of a text element (inside sticky-note padding). */
export function textOrigin(el: TextElement): Vec {
  const pad = el.note ? notePad(el.note) : 0;
  return { x: el.x + pad, y: el.y + pad };
}

/** The link under world point `p`, if any. */
export function linkAt(el: TextElement, p: Vec): string | null {
  const l = textLayout(el);
  const o = textOrigin(el);
  for (const line of l.lines) {
    if (p.y < o.y + line.y || p.y > o.y + line.y + l.lineHeight) continue;
    for (const r of line.runs) if (r.marks?.link && p.x >= o.x + r.x && p.x <= o.x + r.x + r.w) return r.marks.link;
  }
  return null;
}

/** Axis-aligned bounds of a w×h box rotated about its centre. */
export function rotatedBounds(x: number, y: number, w: number, h: number, deg = 0): Rect {
  if (!deg) return { x, y, w, h };
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const bw = w * c + h * s, bh = w * s + h * c;
  return { x: x + w / 2 - bw / 2, y: y + h / 2 - bh / 2, w: bw, h: bh };
}

const boxBounds = (el: ImageElement | EquationElement) => rotatedBounds(el.x, el.y, el.w, el.h, el.rotation);

export function elementBounds(el: BoardElement): Rect {
  const cached = boundsCache.get(el);
  if (cached) return cached;
  let r: Rect;
  switch (el.type) {
    case 'stroke': {
      const p = el.points;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      r = inflate({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, el.size);
      break;
    }
    case 'shape': {
      if (el.kind === 'polygon' && el.pts) {
        const xs = el.pts.filter((_, i) => i % 2 === 0);
        const ys = el.pts.filter((_, i) => i % 2 === 1);
        r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      } else {
        r = rectFromPoints(el.x1, el.y1, el.x2, el.y2);
        if (el.kind === 'callout') {
          const [tx, ty] = calloutTail(el);
          r = unionRects([r, { x: tx, y: ty, w: 0, h: 0 }])!;
        }
      }
      r = inflate(r, el.size / 2 + (el.kind === 'arrow' ? el.size * 3 : 0));
      break;
    }
    case 'text': {
      if (el.note) r = { x: el.x, y: el.y, w: el.note.w, h: el.note.h };
      else {
        const m = textLayout(el);
        r = { x: el.x, y: el.y, w: m.w, h: m.h };
      }
      break;
    }
    case 'image':
    case 'equation':
      r = boxBounds(el);
      break;
    case 'dot':
      r = { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
      break;
  }
  boundsCache.set(el, r);
  return r;
}

// ─── Hit testing ──────────────────────────────────────────────────────

/** Squared distance from p to segment ab. */
export function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/** Minimum squared distance between segments ab and cd. */
export function segmentsDistSq(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distToSegmentSq(ax, ay, cx, cy, dx, dy),
    distToSegmentSq(bx, by, cx, cy, dx, dy),
    distToSegmentSq(cx, cy, ax, ay, bx, by),
    distToSegmentSq(dx, dy, ax, ay, bx, by),
  );
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Tail tip of a callout (stored, or a default below-left of the box). */
export function calloutTail(el: ShapeElement): [number, number] {
  if (el.pts && el.pts.length >= 2) return [el.pts[0], el.pts[1]];
  const x0 = Math.min(el.x1, el.x2), y1 = Math.max(el.y1, el.y2);
  const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
  return [x0 + w * 0.18, y1 + Math.max(12, h * 0.35)];
}

/** Where a callout's tail meets the bottom edge: [left x, right x]. */
export function calloutBase(el: ShapeElement): [number, number] {
  const x0 = Math.min(el.x1, el.x2), w = Math.abs(el.x2 - el.x1);
  const [tx] = calloutTail(el);
  const mid = clamp(tx, x0 + w * 0.2, x0 + w * 0.8);
  const half = Math.min(w * 0.12, 18 + w * 0.04);
  return [mid - half, mid + half];
}

/**
 * Callout outline as path commands (shared by canvas and SVG so both match):
 * a rounded box with a tail from the bottom edge.
 */
export type PathCmd = ['M' | 'L', number, number] | ['Q', number, number, number, number] | ['Z'];

export function calloutCommands(el: ShapeElement): PathCmd[] {
  const l = Math.min(el.x1, el.x2), r = Math.max(el.x1, el.x2), t = Math.min(el.y1, el.y2), b = Math.max(el.y1, el.y2);
  const rad = Math.min(r - l, b - t, 96) * 0.18;
  const [tx, ty] = calloutTail(el);
  const [ba, bb] = calloutBase(el);
  return [
    ['M', l + rad, t],
    ['L', r - rad, t],
    ['Q', r, t, r, t + rad],
    ['L', r, b - rad],
    ['Q', r, b, r - rad, b],
    ['L', bb, b],
    ['L', tx, ty],
    ['L', ba, b],
    ['L', l + rad, b],
    ['Q', l, b, l, b - rad],
    ['L', l, t + rad],
    ['Q', l, t, l + rad, t],
    ['Z'],
  ];
}

/** Outline segments of a shape, flat [ax, ay, bx, by, ...]. */
export function shapeSegments(el: ShapeElement): number[] {
  const { x1, y1, x2, y2 } = el;
  switch (el.kind) {
    case 'callout': {
      const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
      const [tx, ty] = calloutTail(el);
      const [ba, bb] = calloutBase(el);
      return [l, t, r, t, r, t, r, b, r, b, bb, b, bb, b, tx, ty, tx, ty, ba, b, ba, b, l, b, l, b, l, t];
    }
    case 'line':
    case 'arrow':
      return [x1, y1, x2, y2];
    case 'rect':
      return [x1, y1, x2, y1, x2, y1, x2, y2, x2, y2, x1, y2, x1, y2, x1, y1];
    case 'triangle': {
      const mx = (x1 + x2) / 2;
      const top = Math.min(y1, y2), bot = Math.max(y1, y2);
      return [mx, top, x2, bot, x2, bot, x1, bot, x1, bot, mx, top];
    }
    case 'polygon': {
      const p = el.pts ?? [];
      const out: number[] = [];
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        out.push(p[i], p[i + 1], p[j], p[j + 1]);
      }
      return out;
    }
    case 'ellipse': {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      const out: number[] = [];
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
        out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cx + Math.cos(b) * rx, cy + Math.sin(b) * ry);
      }
      return out;
    }
  }
}

function pointInPolygon(px: number, py: number, segs: number[]) {
  let inside = false;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Does a point (with tolerance r) hit this element? */
export function hitTestPoint(el: BoardElement, p: Vec, r: number): boolean {
  const b = elementBounds(el);
  if (!pointInRect(p, inflate(b, r))) return false;
  switch (el.type) {
    case 'stroke': {
      const pts = el.points;
      const tol = (r + el.size / 2) ** 2;
      if (pts.length === 3) return (pts[0] - p.x) ** 2 + (pts[1] - p.y) ** 2 <= tol;
      for (let i = 3; i < pts.length; i += 3) {
        if (distToSegmentSq(p.x, p.y, pts[i - 3], pts[i - 2], pts[i], pts[i + 1]) <= tol) return true;
      }
      return false;
    }
    case 'shape': {
      const segs = shapeSegments(el);
      const tol = (r + el.size / 2) ** 2;
      for (let i = 0; i < segs.length; i += 4) {
        if (distToSegmentSq(p.x, p.y, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]) <= tol) return true;
      }
      return el.fill && el.kind !== 'line' && el.kind !== 'arrow' && pointInPolygon(p.x, p.y, segs);
    }
    case 'text':
    case 'image':
    case 'equation':
      return true;
    case 'dot':
      return (p.x - el.x) ** 2 + (p.y - el.y) ** 2 <= (el.r + r) ** 2;
  }
}

/** Does the swept eraser segment a→b (radius r) touch this element? */
export function hitTestSegment(el: BoardElement, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const sweep = inflate(rectFromPoints(ax, ay, bx, by), r);
  if (!rectsIntersect(sweep, elementBounds(el))) return false;
  switch (el.type) {
    case 'stroke': {
      const pts = el.points;
      const tol = (r + el.size / 2) ** 2;
      if (pts.length === 3) return distToSegmentSq(pts[0], pts[1], ax, ay, bx, by) <= tol;
      for (let i = 3; i < pts.length; i += 3) {
        if (segmentsDistSq(ax, ay, bx, by, pts[i - 3], pts[i - 2], pts[i], pts[i + 1]) <= tol) return true;
      }
      return false;
    }
    case 'shape': {
      const segs = shapeSegments(el);
      const tol = (r + el.size / 2) ** 2;
      for (let i = 0; i < segs.length; i += 4) {
        if (segmentsDistSq(ax, ay, bx, by, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]) <= tol) return true;
      }
      return false;
    }
    case 'text':
    case 'image':
    case 'equation':
      return hitTestPoint(el, { x: bx, y: by }, r);
    case 'dot':
      return distToSegmentSq(el.x, el.y, ax, ay, bx, by) <= (el.r + r) ** 2;
  }
}

// ─── Transforms (return new elements) ─────────────────────────────────

export function translateElement<T extends BoardElement>(el: T, dx: number, dy: number): T {
  switch (el.type) {
    case 'stroke': {
      const p = el.points.slice();
      for (let i = 0; i < p.length; i += 3) { p[i] += dx; p[i + 1] += dy; }
      return { ...el, points: p };
    }
    case 'shape':
      return {
        ...el,
        x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy,
        pts: el.pts?.map((v, i) => v + (i % 2 ? dy : dx)),
      };
    case 'text':
    case 'image':
    case 'equation':
    case 'dot':
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
  return el;
}

/** Scale about origin (ox, oy) by factor s (uniform, keeps line weights). */
export function scaleElement<T extends BoardElement>(el: T, ox: number, oy: number, s: number): T {
  const sx = (x: number) => ox + (x - ox) * s;
  const sy = (y: number) => oy + (y - oy) * s;
  switch (el.type) {
    case 'stroke': {
      const p = el.points.slice();
      for (let i = 0; i < p.length; i += 3) { p[i] = sx(p[i]); p[i + 1] = sy(p[i + 1]); }
      return { ...el, points: p };
    }
    case 'shape':
      return {
        ...el,
        x1: sx(el.x1), y1: sy(el.y1), x2: sx(el.x2), y2: sy(el.y2),
        pts: el.pts?.map((v, i) => (i % 2 ? sy(v) : sx(v))),
      };
    case 'text':
      return {
        ...el,
        x: sx(el.x), y: sy(el.y),
        fontSize: Math.max(4, el.fontSize * s),
        note: el.note && { ...el.note, w: el.note.w * s, h: el.note.h * s },
      };
    case 'image':
    case 'equation':
      return { ...el, x: sx(el.x), y: sy(el.y), w: el.w * s, h: el.h * s };
    case 'dot':
      return { ...el, x: sx(el.x), y: sy(el.y), r: el.r * s };
  }
  return el;
}
