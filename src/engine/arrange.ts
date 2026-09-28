import { distToSegmentSq, elementBounds, hitTestSegment, translateElement, uid, unionRects } from './geometry';
import type { Background, BoardElement, Rect, StrokeElement } from './types';

/**
 * Object management: groups, alignment, distribution, z-order, the page
 * grid and partial (segment) erasing. Pure functions over element lists,
 * so every command is one undoable store op.
 */

// ─── Groups ───────────────────────────────────────────────────────────

/** `ids` plus every other member of any group they belong to. */
export function expandGroups(elements: readonly BoardElement[], ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  const groups = new Set<string>();
  for (const el of elements) if (out.has(el.id) && el.groupId) groups.add(el.groupId);
  if (groups.size) for (const el of elements) if (el.groupId && groups.has(el.groupId)) out.add(el.id);
  return out;
}

/** Selected elements as units: each group is one unit, loose elements are their own. */
export function selectionUnits(elements: readonly BoardElement[], ids: ReadonlySet<string>): BoardElement[][] {
  const byGroup = new Map<string, BoardElement[]>();
  const units: BoardElement[][] = [];
  for (const el of elements) {
    if (!ids.has(el.id)) continue;
    if (el.groupId) {
      let u = byGroup.get(el.groupId);
      if (!u) {
        byGroup.set(el.groupId, (u = []));
        units.push(u);
      }
      u.push(el);
    } else units.push([el]);
  }
  return units;
}

const unitBounds = (u: BoardElement[]) => unionRects(u.map(elementBounds))!;

/** Group the selection (one flat group; existing groups merge into it). */
export function groupElements(els: BoardElement[]): BoardElement[] {
  const g = uid();
  return els.map((e) => ({ ...e, groupId: g }));
}

export function ungroupElements(els: BoardElement[]): BoardElement[] {
  return els.map((e) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { groupId: _g, ...rest } = e;
    return rest as BoardElement;
  });
}

// ─── Align & distribute ───────────────────────────────────────────────

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Align units to the selection's bounds (Keynote behaviour). Returns the
 * moved elements (unchanged ones are left out).
 */
export function alignUnits(units: BoardElement[][], mode: AlignMode): BoardElement[] {
  if (units.length < 2) return [];
  const all = unionRects(units.map(unitBounds))!;
  const out: BoardElement[] = [];
  for (const u of units) {
    const b = unitBounds(u);
    let dx = 0, dy = 0;
    if (mode === 'left') dx = all.x - b.x;
    if (mode === 'center') dx = all.x + all.w / 2 - (b.x + b.w / 2);
    if (mode === 'right') dx = all.x + all.w - (b.x + b.w);
    if (mode === 'top') dy = all.y - b.y;
    if (mode === 'middle') dy = all.y + all.h / 2 - (b.y + b.h / 2);
    if (mode === 'bottom') dy = all.y + all.h - (b.y + b.h);
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) out.push(...u.map((e) => translateElement(e, dx, dy)));
  }
  return out;
}

/** Space units evenly (equal gaps) between the first and last along an axis. */
export function distributeUnits(units: BoardElement[][], axis: 'x' | 'y'): BoardElement[] {
  if (units.length < 3) return [];
  const items = units.map((u) => ({ u, b: unitBounds(u) })).sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const size = (r: Rect) => (axis === 'x' ? r.w : r.h);
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const first = items[0].b, last = items[items.length - 1].b;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - items.reduce((s, i) => s + size(i.b), 0)) / (items.length - 1);
  const out: BoardElement[] = [];
  let cursor = pos(first) + size(first) + gap;
  for (const it of items.slice(1, -1)) {
    const d = cursor - pos(it.b);
    if (Math.abs(d) > 1e-9) out.push(...it.u.map((e) => (axis === 'x' ? translateElement(e, d, 0) : translateElement(e, 0, d))));
    cursor += size(it.b) + gap;
  }
  return out;
}

// ─── Z-order ──────────────────────────────────────────────────────────

export type LayerMove = 'front' | 'back' | 'forward' | 'backward';

/** The page's element order after moving `ids` (relative order kept). */
export function reorder(elements: readonly BoardElement[], ids: ReadonlySet<string>, move: LayerMove): BoardElement[] {
  const sel = elements.filter((e) => ids.has(e.id));
  const rest = elements.filter((e) => !ids.has(e.id));
  if (!sel.length) return elements.slice();
  if (move === 'front') return [...rest, ...sel];
  if (move === 'back') return [...sel, ...rest];
  const out = elements.slice();
  if (move === 'forward') {
    // Hop each selected run over the next unselected element above it.
    for (let i = out.length - 2; i >= 0; i--) {
      if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) {
        let j = i;
        while (j > 0 && ids.has(out[j - 1].id)) j--;
        const [above] = out.splice(i + 1, 1);
        out.splice(j, 0, above);
        i = j;
      }
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) {
        let j = i;
        while (j < out.length - 1 && ids.has(out[j + 1].id)) j++;
        const [below] = out.splice(i - 1, 1);
        out.splice(j, 0, below);
        i = j;
      }
    }
  }
  return out;
}

/** A store op (removed/added with indices) that turns `before` into `after` — same elements, new order. */
export function orderOp(pageId: string, before: readonly BoardElement[], after: readonly BoardElement[]) {
  const moved = new Set<string>();
  const index = new Map(after.map((e, i) => [e.id, i]));
  before.forEach((e, i) => index.get(e.id) !== i && moved.add(e.id));
  // Minimal-ish: remove the elements whose position changed, re-add them at their final indices.
  const removed = before.map((el, i) => ({ index: i, el })).filter((p) => moved.has(p.el.id));
  const added = after.map((el, i) => ({ index: i, el })).filter((p) => moved.has(p.el.id));
  return { kind: 'elements' as const, pageId, removed, added };
}

/** The op that swaps `removed` for `pieces` in place: pieces take the original's z-position. */
export function replaceWithPieces(pageId: string, elements: readonly BoardElement[], pieces: ReadonlyMap<string, BoardElement[]>) {
  const removed: { index: number; el: BoardElement }[] = [];
  const added: { index: number; el: BoardElement }[] = [];
  let at = 0;
  elements.forEach((el, i) => {
    const p = pieces.get(el.id);
    if (!p) {
      at++;
      return;
    }
    removed.push({ index: i, el });
    for (const piece of p) added.push({ index: at++, el: piece });
  });
  return { kind: 'elements' as const, pageId, removed, added };
}

// ─── Grid ─────────────────────────────────────────────────────────────

/** World units between grid lines for each paper (matches the drawn pattern). */
export function gridStep(bg: Background): number {
  switch (bg) {
    case 'grid':
      return 32;
    case 'graph':
      return 20;
    case 'lined':
      return 36;
    default:
      return 24;
  }
}

export const snapTo = (v: number, step: number) => Math.round(v / step) * step;

// ─── Segment erasing ─────────────────────────────────────────────────

/**
 * Erase the part of a stroke within `r` of the swept segment a→b. Returns
 * the surviving pieces (possibly none), or null when the stroke wasn't touched.
 */
export function eraseStrokeSegment(el: StrokeElement, ax: number, ay: number, bx: number, by: number, r: number): StrokeElement[] | null {
  const tol = (r + el.size / 2) ** 2;
  if (!hitTestSegment(el, ax, ay, bx, by, r)) return null;
  // Optimized strokes can have long straight spans: resample so cuts land where the eraser went.
  const step = Math.max(0.5, Math.min(r, el.size) * 0.5);
  const p = densify(el.points, step);
  const n = p.length / 3;
  const hit = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    if (distToSegmentSq(p[i * 3], p[i * 3 + 1], ax, ay, bx, by) <= tol) {
      hit[i] = 1;
      any = true;
    }
  }
  if (!any) return null;
  const pieces: StrokeElement[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 6) pieces.push({ ...el, id: uid(), points: run });
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (hit[i]) flush();
    else run.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }
  flush();
  return pieces;
}

/** Insert interpolated samples so no two neighbours are more than `step` apart. */
export function densify(p: number[], step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    if (i > 0) {
      const dx = p[i] - p[i - 3], dy = p[i + 1] - p[i - 2];
      const k = Math.floor(Math.hypot(dx, dy) / step);
      for (let j = 1; j < k && j < 2000; j++) {
        const t = j / k;
        out.push(p[i - 3] + dx * t, p[i - 2] + dy * t, p[i - 1] + (p[i + 2] - p[i - 1]) * t);
      }
    }
    out.push(p[i], p[i + 1], p[i + 2]);
  }
  return out;
}
