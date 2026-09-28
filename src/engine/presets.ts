import { AUFBAU, configuration, configurationText, elementByZ, orbitalFilling, shellCounts, subshellName } from './chem';
import { getTextMeasurer, uid } from './geometry';
import type { BoardElement, ColorToken, ShapeElement, TextElement } from './types';

/**
 * Science presets for the Elements app: ready-made diagrams built from
 * ordinary board elements, so everything stays editable, movable and
 * erasable after it's placed.
 */

export const MAX_ENERGY_LEVELS = 5;

export interface PresetOptions {
  /** World-space centre. */
  cx: number;
  cy: number;
  /** World units per screen pixel (1 / zoom), so presets land at a readable size. */
  unit: number;
  color: ColorToken;
}

/** Screen-px dimensions of the Bohr model. */
export const BOHR = { nucleus: 56, gap: 40, stroke: 2.5, label: 22 };

const circle = (cx: number, cy: number, r: number, color: ColorToken, size: number): ShapeElement => ({
  id: uid(),
  type: 'shape',
  kind: 'ellipse',
  x1: cx - r,
  y1: cy - r,
  x2: cx + r,
  y2: cy + r,
  color,
  size,
  fill: false,
});

const label = (text: string, x: number, y: number, fontSize: number, color: ColorToken): TextElement => ({
  id: uid(),
  type: 'text',
  x,
  y,
  text,
  spans: [{ text, marks: { bold: true } }],
  color,
  fontSize,
});

/**
 * Bohr model: a nucleus with "p =" and "n =" labels to fill in, surrounded
 * by one ring per energy level (1–5).
 */
export function bohrModel(levels: number, o: PresetOptions): BoardElement[] {
  const n = Math.max(1, Math.min(MAX_ENERGY_LEVELS, Math.round(levels)));
  const u = o.unit;
  const size = BOHR.stroke * u;
  const nucleus = BOHR.nucleus * u;
  const els: BoardElement[] = [circle(o.cx, o.cy, nucleus, o.color, size)];
  for (let k = 1; k <= n; k++) els.push(circle(o.cx, o.cy, nucleus + k * BOHR.gap * u, o.color, size));
  const fs = BOHR.label * u;
  const x = o.cx - nucleus * 0.5;
  els.push(label('p =', x, o.cy - fs * 1.35, fs, o.color), label('n =', x, o.cy + fs * 0.1, fs, o.color));
  return els;
}

/** Outer radius in screen px, for previews and fitting. */
export const bohrRadius = (levels: number) => BOHR.nucleus + Math.min(MAX_ENERGY_LEVELS, Math.max(1, levels)) * BOHR.gap;

/**
 * Where a dot dropped at `p` should land: exactly on the nearest circle or
 * ellipse outline within `tol` (world units), otherwise where it was
 * dropped. Lets electrons sit neatly on Bohr model orbits.
 */
export function snapToRing(elements: readonly BoardElement[], p: { x: number; y: number }, tol: number): { x: number; y: number; snapped: boolean } {
  let best: { x: number; y: number } | null = null;
  let bestD = tol;
  for (const el of elements) {
    if (el.type !== 'shape' || el.kind !== 'ellipse') continue;
    const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
    const rx = Math.abs(el.x2 - el.x1) / 2, ry = Math.abs(el.y2 - el.y1) / 2;
    if (rx < 1e-6 || ry < 1e-6) continue;
    const nx = (p.x - cx) / rx, ny = (p.y - cy) / ry;
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) continue;
    const q = { x: cx + (rx * nx) / len, y: cy + (ry * ny) / len };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best ? { ...best, snapped: true } : { ...p, snapped: false };
}

// ─── Orbital diagrams & element tiles ────────────────────────────────


/** Screen-px metrics of orbital diagrams. */
export const ORBITAL = { box: 34, gap: 6, row: 50, stroke: 2, label: 18, arrow: 2.2 };

const rect = (x: number, y: number, w: number, h: number, color: ColorToken, size: number): ShapeElement => ({
  id: uid(), type: 'shape', kind: 'rect', x1: x, y1: y, x2: x + w, y2: y + h, color, size, fill: false,
});

const arrow = (x: number, y1: number, y2: number, color: ColorToken, size: number): ShapeElement => ({
  id: uid(), type: 'shape', kind: 'arrow', x1: x, y1, x2: x, y2, color, size, fill: false,
});

const plain = (text: string, x: number, y: number, fontSize: number, color: ColorToken, bold = false): TextElement => ({
  id: uid(), type: 'text', x, y, text, color, fontSize, ...(bold ? { spans: [{ text, marks: { bold: true } }] } : {}),
});

const textWidth = (text: string, fontSize: number, bold = false) => getTextMeasurer()(text, fontSize, bold ? { bold: true } : undefined);

/** Text centred horizontally on `cx`. */
const centred = (text: string, cx: number, y: number, fontSize: number, color: ColorToken, bold = false) => plain(text, cx - textWidth(text, fontSize, bold) / 2, y, fontSize, color, bold);

export type OrbitalStyle = 'energy' | 'row';

/**
 * Orbital diagram for element `z`: one box per orbital, grouped by
 * subshell, with ↑/↓ electrons filled by Hund's rule.
 *  • 'energy': subshells stacked by energy (aufbau order, 1s at the bottom)
 *    with s, p and d in their own columns and an energy axis.
 *  • 'row': the compact textbook row notation.
 * Everything is ordinary shapes and text, grouped so it moves as one.
 */
export function orbitalDiagram(z: number, style: OrbitalStyle, o: PresetOptions): BoardElement[] {
  const u = o.unit;
  const B = ORBITAL.box * u, G = ORBITAL.gap * u, size = ORBITAL.stroke * u, fs = ORBITAL.label * u;
  const config = configuration(z);
  const filled = new Map(config.map((s) => [subshellName(s), s.electrons]));
  // Every subshell up to the last occupied one, so empty lower-energy boxes still show.
  const lastIdx = AUFBAU.findIndex((s) => subshellName(s) === subshellName(config[config.length - 1]));
  const shells = AUFBAU.slice(0, lastIdx + 1).map((s) => ({ ...s, electrons: filled.get(subshellName(s)) ?? 0 }));
  const els: BoardElement[] = [];
  const boxes = (x: number, y: number, l: number, electrons: number) => {
    orbitalFilling(l, electrons).forEach((spins, i) => {
      const bx = x + i * B;
      els.push(rect(bx, y, B, B, o.color, size));
      const a = ORBITAL.arrow * u;
      if (spins >= 1) els.push(arrow(bx + B * 0.36, y + B * 0.84, y + B * 0.16, o.color, a));
      if (spins >= 2) els.push(arrow(bx + B * 0.64, y + B * 0.16, y + B * 0.84, o.color, a));
    });
  };
  const el = elementByZ(z);
  if (style === 'row') {
    let x = 0;
    const slots = shells.map((s) => {
      const w = (2 * s.l + 1) * B;
      const at = x;
      x += w + G * 3;
      return { s, at, w };
    });
    const total = x - G * 3;
    const x0 = o.cx - total / 2, y0 = o.cy - B / 2;
    for (const { s, at, w } of slots) {
      boxes(x0 + at, y0, s.l, s.electrons);
      els.push(centred(subshellName(s), x0 + at + w / 2, y0 + B + G, fs, o.color, true));
    }
    els.push(plain(`${el.symbol} · ${el.name}`, x0, y0 - fs * 2.2, fs * 1.1, o.color, true));
    els.push(plain(configurationText(z), x0, y0 + B + fs * 2.4, fs * 0.9, o.color));
  } else {
    const colX = [0, 3.4 * B, 8.2 * B];
    const rows = shells.length;
    const R = ORBITAL.row * u;
    const height = (rows - 1) * R + B;
    const width = colX[Math.max(...shells.map((s) => s.l))] + (2 * Math.max(...shells.map((s) => s.l)) + 1) * B;
    const x0 = o.cx - width / 2 + fs, y0 = o.cy + height / 2 - B;
    shells.forEach((s, i) => {
      const x = x0 + colX[s.l] + fs * 1.6;
      const y = y0 - i * R;
      boxes(x, y, s.l, s.electrons);
      const name = subshellName(s);
      els.push(plain(name, x - textWidth(name, fs, true) - G * 1.5, y + (B - fs * 1.3) / 2, fs, o.color, true));
    });
    // Energy axis on the left.
    const ax = x0 - fs * 1.2;
    els.push(arrow(ax, y0 + B, y0 - height + B - R * 0.6, o.color, size));
    els.push(plain('Energy', ax - textWidth('Energy', fs * 0.8) / 2, y0 - height + B - R * 0.6 - fs * 1.4, fs * 0.8, o.color));
    els.push(plain(`${el.symbol} · ${el.name}`, x0 + fs * 1.6, y0 - height + B - R * 0.6 - fs * 1.4, fs * 1.1, o.color, true));
    els.push(plain(configurationText(z), x0 + fs * 1.6, y0 + B + fs * 0.9, fs * 0.9, o.color));
  }
  const group = uid();
  return els.map((e) => ({ ...e, groupId: group }));
}

/** Screen-px size of an element tile. */
export const TILE = { w: 132, h: 156 };

/** A periodic-table tile: atomic number, symbol, name and atomic mass. */
export function elementTile(z: number, o: PresetOptions): BoardElement[] {
  const u = o.unit;
  const e = elementByZ(z);
  const w = TILE.w * u, h = TILE.h * u;
  const x = o.cx - w / 2, y = o.cy - h / 2;
  const box: ShapeElement = { ...rect(x, y, w, h, o.color, 2.5 * u) };
  const els: BoardElement[] = [
    box,
    plain(String(e.z), x + 12 * u, y + 10 * u, 18 * u, o.color, true),
    centred(e.symbol, o.cx, y + 34 * u, 54 * u, o.color, true),
    centred(e.name, o.cx, y + 100 * u, 16 * u, o.color),
    centred(String(e.mass), o.cx, y + 124 * u, 14 * u, o.color),
  ];
  const group = uid();
  return els.map((el) => ({ ...el, groupId: group }));
}

/**
 * Bohr model of a real element: its shells as rings, p/n filled in, and
 * the electrons placed evenly on each ring as dots.
 */
export function bohrElement(z: number, o: PresetOptions): BoardElement[] {
  const e = elementByZ(z);
  const shells = shellCounts(z);
  const levels = Math.min(MAX_ENERGY_LEVELS, shells.length);
  const base = bohrModel(levels, o);
  const u = o.unit;
  const neutrons = Math.round(e.mass) - e.z;
  const out = base.map((el): BoardElement => {
    if (el.type !== 'text') return el;
    const text = el.text === 'p =' ? `p = ${e.z}` : `n = ${neutrons}`;
    return { ...el, text, spans: [{ text, marks: { bold: true } }] };
  });
  const r = 6 * u;
  shells.slice(0, levels).forEach((count, k) => {
    const radius = (BOHR.nucleus + (k + 1) * BOHR.gap) * u;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
      out.push({ id: uid(), type: 'dot', x: o.cx + Math.cos(a) * radius, y: o.cy + Math.sin(a) * radius, r, color: o.color });
    }
  });
  out.push(centred(`${e.symbol} · ${e.name}`, o.cx, o.cy + bohrRadius(levels) * u + 14 * u, 20 * u, o.color, true));
  const group = uid();
  return out.map((el) => ({ ...el, groupId: group }));
}
