import type { ShapeElement } from './types';

/**
 * "Hold to snap" shape recognition, in the spirit of Apple Notes:
 * draw a rough line, circle, rectangle or triangle and keep the pen still
 * for a beat — the stroke becomes a clean vector shape.
 */

export type Recognized = Pick<ShapeElement, 'kind' | 'x1' | 'y1' | 'x2' | 'y2' | 'pts'>;

type P = [number, number];

function pathLength(pts: P[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

function perpDist(p: P, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  let max = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  const left = simplify(pts.slice(0, idx + 1), eps);
  const right = simplify(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/** Interior angle at b (radians). */
function angleAt(a: P, b: P, c: P) {
  const v1x = a[0] - b[0], v1y = a[1] - b[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
  const cos = (v1x * v2x + v1y * v2y) / ((Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** Merge corners closer than `minGap` and drop near-straight vertices. */
function cleanCorners(poly: P[], minGap: number): P[] {
  let pts = poly.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (Math.hypot(b[0] - c[0], b[1] - c[1]) < minGap || angleAt(a, b, c) > (160 * Math.PI) / 180) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** Snap a line within a few degrees of horizontal, vertical or 45° onto it (length kept). */
export function straighten(r: Recognized): Recognized {
  const dx = r.x2 - r.x1, dy = r.y2 - r.y1;
  const a = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(a / step) * step;
  if (Math.abs(a - snapped) > (6 * Math.PI) / 180) return r;
  const len = Math.hypot(dx, dy);
  return { ...r, x2: r.x1 + Math.cos(snapped) * len, y2: r.y1 + Math.sin(snapped) * len };
}

/** Nearly round ellipses become circles, nearly square rectangles become squares (about their centre). */
export function regularize(r: Recognized): Recognized {
  if (r.kind !== 'ellipse' && r.kind !== 'rect') return r;
  const w = Math.abs(r.x2 - r.x1), h = Math.abs(r.y2 - r.y1);
  if (Math.min(w, h) / Math.max(w, h) < 0.86) return r;
  const s = (w + h) / 2, cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
  return { ...r, x1: cx - s / 2, y1: cy - s / 2, x2: cx + s / 2, y2: cy + s / 2 };
}

export function recognize(flat: ArrayLike<number>): Recognized | null {
  const r = recognizeRaw(flat);
  if (!r) return null;
  return r.kind === 'line' ? straighten(r) : regularize(r);
}

function recognizeRaw(flat: ArrayLike<number>): Recognized | null {
  const raw: P[] = [];
  for (let i = 0; i + 1 < flat.length; i += 3) raw.push([flat[i], flat[i + 1]]);
  if (raw.length < 4) return null;

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of raw) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const w = x1 - x0, h = y1 - y0;
  const diag = Math.hypot(w, h);
  if (diag < 16) return null;

  const len = pathLength(raw);
  const first = raw[0], last = raw[raw.length - 1];
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1]);

  // Straight line: the path barely deviates from its chord.
  if (chord / len > 0.92) {
    const maxDev = raw.reduce((m, p) => Math.max(m, perpDist(p, first, last)), 0);
    if (maxDev < Math.max(6, chord * 0.06)) {
      return { kind: 'line', x1: first[0], y1: first[1], x2: last[0], y2: last[1] };
    }
  }

  // Closed shapes: endpoints come back near the start.
  if (chord > Math.max(diag * 0.3, 24)) return null;

  // Ellipse: radial distance from the bbox-centred ellipse is consistent.
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2 || 1, ry = h / 2 || 1;
  let err = 0;
  for (const [x, y] of raw) err += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1);
  err /= raw.length;

  // RDP needs distinct endpoints, so split the loop at its farthest point.
  let far = 0, farD = 0;
  raw.forEach((p, i) => {
    const d = Math.hypot(p[0] - first[0], p[1] - first[1]);
    if (d > farD) { farD = d; far = i; }
  });
  const eps = diag * 0.075;
  const loop = [
    ...simplify(raw.slice(0, far + 1), eps).slice(0, -1),
    ...simplify([...raw.slice(far), first], eps).slice(0, -1),
  ];
  const poly = cleanCorners(loop, diag * 0.12);

  if (poly.length >= 5 && err < 0.2) {
    return { kind: 'ellipse', x1: x0, y1: y0, x2: x1, y2: y1 };
  }
  if (poly.length === 3) {
    return { kind: 'polygon', x1: x0, y1: y0, x2: x1, y2: y1, pts: poly.flat() };
  }
  if (poly.length === 4) {
    // Near-axis-aligned quads become true rectangles.
    const aligned = poly.every((p, i) => {
      const q = poly[(i + 1) % 4];
      const a = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2);
      return a < 0.22 || a > Math.PI / 2 - 0.22;
    });
    if (aligned) return { kind: 'rect', x1: x0, y1: y0, x2: x1, y2: y1 };
    return { kind: 'polygon', x1: x0, y1: y0, x2: x1, y2: y1, pts: poly.flat() };
  }
  if (err < 0.26) return { kind: 'ellipse', x1: x0, y1: y0, x2: x1, y2: y1 };
  return null;
}
