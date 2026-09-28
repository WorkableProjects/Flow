import { outlineToSvg, strokeOutline } from './freehand';
import { calloutCommands, elementBounds, inflate, textLayout, textOrigin, unionRects } from './geometry';
import { FONT_STACKS, BOLD_WEIGHT, BASE_WEIGHT } from './richtext';
import type { BoardTheme } from './theme';
import type { BoardElement, EquationElement, ImageElement, Page, Rect, ShapeElement, TextElement } from './types';

/**
 * Vector export: a page as a standalone SVG document. Ink keeps its
 * pressure-shaped outline, text stays real (selectable) text, equations
 * stay vector glyphs, and images are embedded, so the file prints and
 * scales cleanly anywhere.
 */

const f = (n: number) => +n.toFixed(2);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shapeSvg(el: ShapeElement, theme: BoardTheme): string {
  const color = theme.resolve(el.color);
  const { x1, y1, x2, y2 } = el;
  const common = `stroke="${color}" stroke-width="${f(el.size)}" stroke-linecap="round" stroke-linejoin="round"`;
  const fill = el.fill && el.kind !== 'line' && el.kind !== 'arrow' ? `fill="${color}" fill-opacity="0.16"` : 'fill="none"';
  switch (el.kind) {
    case 'line':
    case 'arrow': {
      let d = `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
      if (el.kind === 'arrow') {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const len = Math.min(Math.hypot(x2 - x1, y2 - y1) * 0.5, Math.max(12, el.size * 4));
        const s = Math.PI / 7;
        d += `M${f(x2 - len * Math.cos(a - s))} ${f(y2 - len * Math.sin(a - s))}L${f(x2)} ${f(y2)}L${f(x2 - len * Math.cos(a + s))} ${f(y2 - len * Math.sin(a + s))}`;
      }
      return `<path d="${d}" fill="none" ${common}/>`;
    }
    case 'rect': {
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(w, h, 24) * 0.12)}" ${fill} ${common}/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${f((x1 + x2) / 2)}" cy="${f((y1 + y2) / 2)}" rx="${f(Math.abs(x2 - x1) / 2)}" ry="${f(Math.abs(y2 - y1) / 2)}" ${fill} ${common}/>`;
    case 'triangle': {
      const top = Math.min(y1, y2), bot = Math.max(y1, y2);
      return `<path d="M${f((x1 + x2) / 2)} ${f(top)}L${f(x2)} ${f(bot)}L${f(x1)} ${f(bot)}Z" ${fill} ${common}/>`;
    }
    case 'polygon': {
      const p = el.pts ?? [];
      let d = '';
      for (let i = 0; i < p.length; i += 2) d += `${i ? 'L' : 'M'}${f(p[i])} ${f(p[i + 1])}`;
      return `<path d="${d}Z" ${fill} ${common}/>`;
    }
    case 'callout': {
      const d = calloutCommands(el).map((c) => c[0] + c.slice(1).map((v) => f(v as number)).join(' ')).join('');
      return `<path d="${d}" ${fill} ${common}/>`;
    }
  }
}

function textSvg(el: TextElement, theme: BoardTheme): string {
  const layout = textLayout(el);
  const o = textOrigin(el);
  const fs = el.fontSize;
  const lh = layout.lineHeight;
  const pad = (lh - fs) / 2;
  const family = esc(FONT_STACKS[el.font ?? 'sans']);
  let out = '';
  if (el.note) {
    const { w, h, tint } = el.note;
    out += `<rect x="${f(el.x)}" y="${f(el.y)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(14, w * 0.06))}" fill="${theme.noteFill(tint)}"/>`;
  }
  const t = f(Math.max(fs * 0.065, 0.5));
  for (const line of layout.lines) {
    const top = o.y + line.y;
    if (line.marker && line.markerX !== undefined) {
      out += `<text x="${f(o.x + line.markerX)}" y="${f(top + pad)}" text-anchor="end" dominant-baseline="text-before-edge" font-family="${family}" font-size="${f(fs)}" font-weight="${BASE_WEIGHT}" fill="${theme.resolve(el.color)}">${esc(line.marker)}</text>`;
    }
    for (const r of line.runs) {
      if (!r.text) continue;
      const m = r.marks;
      const x = o.x + r.x;
      const color = m?.color ? theme.resolve(m.color) : m?.link ? theme.resolve('blue') : theme.resolve(el.color);
      if (m?.highlight) out += `<rect x="${f(x)}" y="${f(top + pad * 0.4)}" width="${f(r.w)}" height="${f(lh - pad * 0.8)}" fill="${theme.resolve('yellow')}" fill-opacity="0.5"/>`;
      if (m?.code) out += `<rect x="${f(x - fs * 0.08)}" y="${f(top + pad * 0.5)}" width="${f(r.w + fs * 0.16)}" height="${f(lh - pad)}" rx="${f(fs * 0.18)}" fill="${theme.appearance === 'dark' ? '#ebebf5' : '#3c3c43'}" fill-opacity="${theme.appearance === 'dark' ? 0.14 : 0.09}"/>`;
      const fam = m?.code ? esc(FONT_STACKS.mono) : family;
      const text = `<text x="${f(x)}" y="${f(top + pad)}" dominant-baseline="text-before-edge" xml:space="preserve" font-family="${fam}" font-size="${f(fs)}" font-weight="${m?.bold ? BOLD_WEIGHT : BASE_WEIGHT}"${m?.italic ? ' font-style="italic"' : ''} fill="${color}">${esc(r.text)}</text>`;
      out += m?.link ? `<a href="${esc(m.link)}">${text}</a>` : text;
      if (m?.underline || m?.link) out += `<rect x="${f(x)}" y="${f(top + pad + fs * 0.98)}" width="${f(r.w)}" height="${t}" fill="${color}"/>`;
      if (m?.strike) out += `<rect x="${f(x)}" y="${f(top + pad + fs * 0.52)}" width="${f(r.w)}" height="${t}" fill="${color}"/>`;
    }
  }
  if (el.note) {
    const id = `clip-${el.id.replace(/\W/g, '')}`;
    return `<clipPath id="${id}"><rect x="${f(el.x)}" y="${f(el.y)}" width="${f(el.note.w)}" height="${f(el.note.h)}"/></clipPath><g clip-path="url(#${id})">${out}</g>`;
  }
  return out;
}

function boxTransform(el: ImageElement | EquationElement) {
  if (!el.rotation && !el.flipX && !el.flipY) return '';
  const cx = f(el.x + el.w / 2), cy = f(el.y + el.h / 2);
  return ` transform="translate(${cx} ${cy}) rotate(${el.rotation ?? 0}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1}) translate(${-cx} ${-cy})"`;
}

function equationSvg(el: EquationElement, theme: BoardTheme): string {
  const color = theme.resolve(el.color);
  const inner = el.svg
    .replace(/currentColor/g, color)
    .replace(/^<svg\b/, `<svg x="${f(el.x)}" y="${f(el.y)}" preserveAspectRatio="none"`)
    .replace(/\swidth="[^"]*"/, ` width="${f(el.w)}"`)
    .replace(/\sheight="[^"]*"/, ` height="${f(el.h)}"`);
  return `<g${boxTransform(el)}>${inner}</g>`;
}

export function elementSvg(el: BoardElement, theme: BoardTheme): string {
  switch (el.type) {
    case 'stroke': {
      const d = outlineToSvg(strokeOutline(el.points, el.tool, el.size, el.pressure, true, el));
      const color = theme.resolve(el.color);
      if (el.tool === 'highlighter') return `<path d="${d}" fill="${color}" fill-opacity="0.34"${theme.appearance === 'light' ? ' style="mix-blend-mode:multiply"' : ''}/>`;
      return `<path d="${d}" fill="${color}"/>`;
    }
    case 'shape':
      return shapeSvg(el, theme);
    case 'text':
      return textSvg(el, theme);
    case 'image':
      return `<image href="${esc(el.src)}" x="${f(el.x)}" y="${f(el.y)}" width="${f(el.w)}" height="${f(el.h)}" preserveAspectRatio="none"${boxTransform(el)}/>`;
    case 'equation':
      return equationSvg(el, theme);
    case 'dot':
      return `<circle cx="${f(el.x)}" cy="${f(el.y)}" r="${f(el.r)}" fill="${theme.resolve(el.color)}"/>`;
  }
}

/** A set of elements as an SVG document framed on `view` (world units). */
export function elementsToSvg(elements: readonly BoardElement[], theme: BoardTheme, view: Rect, opts: { background?: boolean; title?: string } = {}): string {
  const body = elements.map((el) => elementSvg(el, theme)).join('\n');
  const bg = opts.background === false ? '' : `<rect x="${f(view.x)}" y="${f(view.y)}" width="${f(view.w)}" height="${f(view.h)}" fill="${theme.background}"/>`;
  const title = opts.title ? `<title>${esc(opts.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(view.x)} ${f(view.y)} ${f(view.w)} ${f(view.h)}" width="${f(view.w)}" height="${f(view.h)}">${title}${bg}\n${body}\n</svg>`;
}

/** A page's content as SVG (framed on its content, or `fallback` when empty). */
export function pageToSvg(page: Page, theme: BoardTheme, fallback: Rect, title?: string): string {
  const content = unionRects(page.elements.map(elementBounds));
  const view = content ? inflate(content, 48) : fallback;
  return elementsToSvg(page.elements, theme, view, { title });
}
