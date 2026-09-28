#!/usr/bin/env node
/**
 * Generates src/icons/symbols.ts from the SF Symbols SVG exports in
 * https://github.com/brendanballon/sfsymbols-svg/tree/master/symbols
 *
 * Usage:
 *   node scripts/build-icons.mjs                 # fetch from GitHub
 *   SF_SYMBOLS_DIR=/path/to/symbols node scripts/build-icons.mjs
 *
 * Each exported SVG is a flipped glyph (`scale(1,-1) translate(0,-h)`)
 * with explicit width/height and no viewBox. We extract the size and the
 * path data so <Icon> can render any symbol as a crisp, currentColor SVG.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = 'https://raw.githubusercontent.com/brendanballon/sfsymbols-svg/master/symbols';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** App icon key → SF Symbol name. */
const ICONS = {
  select: 'cursorarrow',
  lasso: 'lasso',
  hand: 'hand.raised',
  pen: 'pencil.tip',
  highlighter: 'highlighter',
  eraser: 'eraser',
  laser: 'cursorarrow.rays',
  shapes: 'circle.square',
  line: 'line.diagonal',
  arrow: 'arrow.up.right',
  rect: 'square',
  ellipse: 'circle',
  triangle: 'triangle',
  text: 'textformat',
  note: 'note.text',
  image: 'photo',
  undo: 'arrow.uturn.backward',
  redo: 'arrow.uturn.forward',
  trash: 'trash',
  duplicate: 'plus.square.on.square',
  share: 'square.and.arrow.up',
  open: 'square.and.arrow.down',
  pages: 'rectangle.portrait.on.rectangle.portrait',
  plus: 'plus',
  minus: 'minus',
  chevronLeft: 'chevron.left',
  chevronRight: 'chevron.right',
  close: 'xmark',
  timer: 'timer',
  play: 'play.fill',
  pause: 'pause.fill',
  reset: 'arrow.counterclockwise',
  curtain: 'rectangle.tophalf.filled',
  bgBlank: 'square',
  bgGrid: 'square.grid.3x3',
  bgDots: 'circle.grid.3x3',
  bgLined: 'line.3.horizontal',
  bgGraph: 'grid',
  moon: 'moon',
  sun: 'sun.max',
  settings: 'gearshape',
  zoomIn: 'plus.magnifyingglass',
  zoomOut: 'minus.magnifyingglass',
  fit: 'viewfinder',
  sparkles: 'sparkles',
  more: 'ellipsis.circle',
  present: 'person.2',
  check: 'checkmark',
  ruler: 'ruler',
  fn: 'function',
  eye: 'eye',
  eyeSlash: 'eye.slash',
  home: 'square.grid.2x2',
  tablet: 'ipad.landscape',
  desktop: 'desktopcomputer',
  search: 'magnifyingglass',
  folder: 'folder',
  clock: 'clock',
  scribble: 'pencil.and.scribble',
  keyboard: 'keyboard',
  handDraw: 'hand.draw',
  books: 'books.vertical',
  checkFill: 'checkmark.circle.fill',
  apps: 'square.grid.2x2',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  equation: 'x.squareroot',
  textBox: 'character.textbox',
  atom: 'atom',
  dot: 'circle.fill',
  person: 'person.crop.circle',
  strike: 'strikethrough',
  code: 'chevron.left.forwardslash.chevron.right',
  link: 'link',
  listBullet: 'list.bullet',
  listNumber: 'list.number',
  alignLeft: 'text.alignleft',
  alignCenter: 'text.aligncenter',
  alignRight: 'text.alignright',
  alignJustify: 'text.justify',
  textSize: 'textformat.size',
  palette: 'paintpalette',
  layers: 'square.3.layers.3d',
  forward: 'square.2.layers.3d.top.filled',
  backward: 'square.2.layers.3d.bottom.filled',
  front: 'square.3.layers.3d.top.filled',
  back: 'square.3.layers.3d.bottom.filled',
  alignObjLeft: 'align.horizontal.left',
  alignObjCenter: 'align.horizontal.center',
  alignObjRight: 'align.horizontal.right',
  alignObjTop: 'align.vertical.top',
  alignObjMiddle: 'align.vertical.center',
  alignObjBottom: 'align.vertical.bottom',
  distributeH: 'distribute.horizontal',
  distributeV: 'distribute.vertical',
  group: 'rectangle.3.group',
  ungroup: 'square.dashed',
  rotate: 'rotate.right',
  flipH: 'arrow.left.and.right',
  flipV: 'arrow.up.and.down',
  annotate: 'text.bubble',
  callout: 'bubble.left',
  polygon: 'pentagon',
  lock: 'lock',
  unlock: 'lock.open',
  exportFile: 'square.and.arrow.down.on.square',
  importFile: 'tray.and.arrow.down',
  clipboard: 'clipboard',
  customize: 'slider.horizontal.3',
  chevronUp: 'chevron.up',
  chevronDown: 'chevron.down',
  eraseSegment: 'eraser.line.dashed',
  smoothing: 'scribble.variable',
  info: 'info.circle',
  help: 'questionmark.circle',
  orbital: 'arrow.up.arrow.down.square',
  elementTile: 'square.text.square',
  hexagon: 'hexagon',
  photoStack: 'photo.on.rectangle',
  edit: 'square.and.pencil',
};

async function load(name) {
  const dir = process.env.SF_SYMBOLS_DIR;
  if (dir) {
    const file = path.join(dir, `${name}.svg`);
    if (!existsSync(file)) throw new Error(`Missing ${file}`);
    return readFile(file, 'utf8');
  }
  const res = await fetch(`${RAW}/${encodeURIComponent(name)}.svg`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

function parse(svg, name) {
  const w = parseFloat(svg.match(/width='([\d.]+)px'/)?.[1] ?? '');
  const h = parseFloat(svg.match(/height='([\d.]+)px'/)?.[1] ?? '');
  if (!w || !h) throw new Error(`${name}: could not read size`);
  const paths = [...svg.matchAll(/\sd='([^']+)'/g)].map((m) =>
    m[1]
      .replace(/\s+/g, ' ')
      .replace(/(\d+\.\d{2})\d+/g, '$1') // 2dp is plenty at icon sizes
      .trim(),
  );
  if (!paths.length) throw new Error(`${name}: no paths`);
  const d = paths.join(' ');
  // Tight bounds (control points included — a hair generous, never clipped)
  // so glyphs of different proportions center optically in a square.
  const nums = d.match(/-?[\d.]+/g).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
  }
  // Glyph space is y-up; the rendered (flipped) box is y' = h - y.
  const vb = [x0, h - y1, x1 - x0, y1 - y0].map((n) => +n.toFixed(2));
  return { w: +w.toFixed(2), h: +h.toFixed(2), vb, d };
}

const entries = await Promise.all(
  Object.entries(ICONS).map(async ([key, name]) => [key, name, parse(await load(name), name)]),
);

let out = `/* eslint-disable */
// AUTO-GENERATED by scripts/build-icons.mjs — do not edit by hand.
// Source: https://github.com/brendanballon/sfsymbols-svg (SF Symbols © Apple Inc.)

export interface SymbolGlyph {
  /** SF Symbol name */
  name: string;
  w: number;
  h: number;
  /** Tight viewBox [x, y, w, h] in rendered (y-down) space */
  vb: readonly [number, number, number, number];
  /** Path data in flipped (y-up) glyph space */
  d: string;
}

export const symbols = {
`;
for (const [key, name, g] of entries) {
  out += `  ${key}: { name: ${JSON.stringify(name)}, w: ${g.w}, h: ${g.h}, vb: [${g.vb.join(', ')}], d: ${JSON.stringify(g.d)} },\n`;
}
out += `} satisfies Record<string, SymbolGlyph>;

export type IconName = keyof typeof symbols;
`;
await writeFile(path.join(root, 'src/icons/symbols.ts'), out);
console.log(`Wrote ${entries.length} symbols to src/icons/symbols.ts`);
