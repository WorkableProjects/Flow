import type { ColorToken, FontFamily, ParaStyle, TextAlign, TextMarks, TextSpan } from './types';

/**
 * Rich text for text boxes and sticky notes.
 *
 * Content is a flat list of spans (runs of text sharing the same marks);
 * '\n' inside span text separates paragraphs, and `paras` holds one style
 * per paragraph (lists). `TextElement.text` keeps the plain-text mirror,
 * so anything that only needs the words (search, paste, older readers)
 * never has to understand formatting.
 *
 * Everything here is plain data in, plain data out: the editor, the canvas
 * renderer, SVG export and hit-testing all share one layout, so text reads
 * the same everywhere it appears.
 */

export type MarkKey = keyof TextMarks;
export type BoolMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'highlight';

export interface MarkSpec {
  key: BoolMark;
  /** Tags that imply the mark when reading editor HTML. */
  tags: string[];
  /** Tag written for the mark when producing editor HTML. */
  tag: string;
  /** Does an element's inline style turn the mark on (true) / off (false)? */
  fromStyle?: (s: CSSStyleDeclaration) => boolean | undefined;
}

const decoration = (s: CSSStyleDeclaration) => s.textDecorationLine || s.textDecoration || '';

/** Boolean marks, innermost first when written as tags. */
export const MARKS: MarkSpec[] = [
  {
    key: 'bold',
    tags: ['B', 'STRONG'],
    tag: 'b',
    fromStyle: (s) => {
      const w = s.fontWeight;
      if (!w) return undefined;
      if (w === 'bold' || w === 'bolder' || +w >= 600) return true;
      if (w === 'normal' || w === 'lighter' || +w < 600) return false;
      return undefined;
    },
  },
  {
    key: 'italic',
    tags: ['I', 'EM'],
    tag: 'i',
    fromStyle: (s) => (s.fontStyle ? s.fontStyle === 'italic' || s.fontStyle === 'oblique' : undefined),
  },
  {
    key: 'underline',
    tags: ['U', 'INS'],
    tag: 'u',
    fromStyle: (s) => {
      const d = decoration(s);
      if (!d) return undefined;
      return d.includes('underline') ? true : d === 'none' ? false : undefined;
    },
  },
  {
    key: 'strike',
    tags: ['S', 'STRIKE', 'DEL'],
    tag: 's',
    fromStyle: (s) => {
      const d = decoration(s);
      if (!d) return undefined;
      return d.includes('line-through') ? true : d === 'none' ? false : undefined;
    },
  },
  { key: 'code', tags: ['CODE', 'KBD', 'SAMP', 'TT'], tag: 'code' },
  { key: 'highlight', tags: ['MARK'], tag: 'mark' },
];

export const BOOL_MARKS: BoolMark[] = MARKS.map((m) => m.key);

/** Only web and mail links are kept (never javascript: or data:). */
export function safeLink(href: string | null | undefined): string | undefined {
  const v = href?.trim();
  if (!v) return undefined;
  if (/^(https?:|mailto:)/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:\d)/.test(v)) return `https://${v}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return undefined;
}

// ─── Span helpers ─────────────────────────────────────────────────────

/** Marks with unset entries dropped; undefined when nothing is set. */
export function cleanMarks(m: TextMarks | undefined): TextMarks | undefined {
  if (!m) return undefined;
  const out: TextMarks = {};
  let any = false;
  for (const k of BOOL_MARKS) {
    if (m[k]) {
      out[k] = true;
      any = true;
    }
  }
  const link = safeLink(m.link);
  if (link) {
    out.link = link;
    any = true;
  }
  if (m.color) {
    out.color = m.color;
    any = true;
  }
  return any ? out : undefined;
}

export function sameMarks(a: TextMarks | undefined, b: TextMarks | undefined) {
  return BOOL_MARKS.every((k) => !!a?.[k] === !!b?.[k]) && (a?.link || '') === (b?.link || '') && (a?.color || '') === (b?.color || '');
}

/** Merge neighbours with equal marks, drop empty runs and unset marks. */
export function normalizeSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const marks = cleanMarks(s.marks);
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, marks)) last.text += s.text;
    else out.push(marks ? { text: s.text, marks } : { text: s.text });
  }
  return out;
}

export const plainText = (spans: TextSpan[]) => spans.map((s) => s.text).join('');

export const hasFormatting = (spans: TextSpan[]) => spans.some((s) => cleanMarks(s.marks) && s.text.trim());

/** The spans of a text element (plain text is one unmarked span). */
export const spansOf = (el: { text: string; spans?: TextSpan[] }): TextSpan[] => el.spans ?? [{ text: el.text }];

/** One style per paragraph of `text`, padded with unstyled paragraphs. */
export function parasOf(el: { text: string; paras?: ParaStyle[] }): ParaStyle[] {
  const n = el.text.split('\n').length;
  return Array.from({ length: n }, (_, i) => el.paras?.[i] ?? {});
}

const cleanPara = (p: ParaStyle | undefined): ParaStyle => (p?.list === 'bullet' || p?.list === 'number' ? { list: p.list } : {});

/** Drop trailing whitespace (and trailing empty lines) across span boundaries. */
export function trimEndSpans(spans: TextSpan[]): TextSpan[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    out.pop();
  }
  return normalizeSpans(out);
}

/** Split into lines on '\n'; every line has at least one (possibly empty) run. */
export function splitLines(spans: TextSpan[]): TextSpan[][] {
  const lines: TextSpan[][] = [[]];
  for (const s of spans) {
    const parts = s.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, marks: s.marks });
    });
  }
  return lines;
}

const markValue = (m: TextMarks | undefined, key: MarkKey) => m?.[key];

/** Is `key` on for every visible character? */
export function markIsOn(spans: TextSpan[], key: MarkKey): boolean {
  const visible = spans.filter((s) => s.text.trim());
  return visible.length > 0 && visible.every((s) => !!markValue(s.marks, key));
}

/** Set a mark (or clear it with false/undefined) for every character. */
export function setMark(spans: TextSpan[], key: MarkKey, value: boolean | string | undefined): TextSpan[] {
  return normalizeSpans(spans.map((s) => ({ text: s.text, marks: { ...s.marks, [key]: value || undefined } })));
}

/** Whole-element toggle: on everywhere unless it already is, then off everywhere. */
export const toggleMark = (spans: TextSpan[], key: BoolMark) => setMark(spans, key, !markIsOn(spans, key));

// ─── Range editing (character offsets into the plain text) ───────────

/** Split runs so that `at` falls on a run boundary; returns the new list and the boundary index. */
function splitAt(spans: TextSpan[], at: number): [TextSpan[], number] {
  const out: TextSpan[] = [];
  let pos = 0;
  let boundary = -1;
  for (const s of spans) {
    const end = pos + s.text.length;
    if (boundary < 0 && at <= pos) boundary = out.length;
    if (boundary < 0 && at > pos && at < end) {
      out.push({ text: s.text.slice(0, at - pos), marks: s.marks }, { text: s.text.slice(at - pos), marks: s.marks });
      boundary = out.length - 1;
    } else out.push(s);
    pos = end;
  }
  return [out, boundary < 0 ? out.length : boundary];
}

/** Apply `fn` to the marks of every character in [start, end). */
export function mapMarks(spans: TextSpan[], start: number, end: number, fn: (m: TextMarks | undefined) => TextMarks | undefined): TextSpan[] {
  if (end <= start) return spans;
  const [a, i] = splitAt(spans, start);
  const [b, j] = splitAt(a, end);
  const lo = i, hi = j;
  return normalizeSpans(b.map((s, k) => (k >= lo && k < hi ? { text: s.text, marks: fn(s.marks) } : s)));
}

export function setMarkRange(spans: TextSpan[], start: number, end: number, key: MarkKey, value: boolean | string | undefined) {
  return mapMarks(spans, start, end, (m) => ({ ...m, [key]: value || undefined }));
}

/** Runs covering [start, end). */
export function sliceSpans(spans: TextSpan[], start: number, end: number): TextSpan[] {
  const out: TextSpan[] = [];
  let pos = 0;
  for (const s of spans) {
    const a = Math.max(start, pos), b = Math.min(end, pos + s.text.length);
    if (b > a) out.push({ text: s.text.slice(a - pos, b - pos), marks: s.marks });
    pos += s.text.length;
  }
  return out;
}

/** Is `key` set on every non-space character in [start, end)? */
export function rangeHas(spans: TextSpan[], start: number, end: number, key: MarkKey): boolean {
  return markIsOn(sliceSpans(spans, start, end), key);
}

/** First value of `key` found in [start, end), e.g. the link under a selection. */
export function rangeValue(spans: TextSpan[], start: number, end: number, key: MarkKey): TextMarks[MarkKey] | undefined {
  return sliceSpans(spans, start, end).find((s) => markValue(s.marks, key))?.marks?.[key];
}

/** Marks that typing at `at` would continue (the character before, or after at a paragraph start). */
export function marksAt(spans: TextSpan[], at: number): TextMarks | undefined {
  const text = plainText(spans);
  const before = at > 0 && text[at - 1] !== '\n' ? sliceSpans(spans, at - 1, at)[0] : sliceSpans(spans, at, at + 1)[0];
  if (!before || before.text === '\n') return undefined;
  // Links end where they end: typing after one doesn't extend it.
  const m = cleanMarks(before.marks);
  if (m?.link) delete m.link;
  return cleanMarks(m);
}

/** Replace [start, end) with `text` carrying `marks`. */
export function replaceRange(spans: TextSpan[], start: number, end: number, text: string, marks?: TextMarks): TextSpan[] {
  const total = plainText(spans).length;
  const a = sliceSpans(spans, 0, start);
  const b = sliceSpans(spans, end, total);
  return normalizeSpans([...a, { text, marks }, ...b]);
}

/** Paragraph index containing character offset `at`. */
export const paraIndexAt = (text: string, at: number) => text.slice(0, at).split('\n').length - 1;

/** Paragraph styles after replacing [start, end) of `text` with `insert`. */
export function replaceParas(paras: ParaStyle[], text: string, start: number, end: number, insert: string): ParaStyle[] {
  const first = paraIndexAt(text, start), last = paraIndexAt(text, end);
  const added = insert.split('\n').length - 1;
  const keep = paras[first] ?? {};
  return [...paras.slice(0, first), ...Array.from({ length: added + 1 }, () => ({ ...keep })), ...paras.slice(last + 1)];
}

/** Toggle a list style on every paragraph touched by [start, end]. */
export function toggleListRange(paras: ParaStyle[], text: string, start: number, end: number, list: 'bullet' | 'number'): ParaStyle[] {
  const first = paraIndexAt(text, start), last = paraIndexAt(text, end);
  const all = parasOf({ text, paras });
  const on = all.slice(first, last + 1).every((p) => p.list === list);
  return all.map((p, i) => (i >= first && i <= last ? (on ? {} : { list }) : p));
}

/** Fields for a TextElement from edited content: plain mirror + spans/paras only when formatted. */
export function textFields(spans: TextSpan[], paras?: ParaStyle[]): { text: string; spans?: TextSpan[]; paras?: ParaStyle[] } {
  const clean = normalizeSpans(spans);
  const text = plainText(clean);
  const n = text.split('\n').length;
  const p = Array.from({ length: n }, (_, i) => cleanPara(paras?.[i]));
  const out: { text: string; spans?: TextSpan[]; paras?: ParaStyle[] } = { text };
  if (hasFormatting(clean)) out.spans = clean;
  if (p.some((x) => x.list)) out.paras = p;
  return out;
}

/** A copy of a text element carrying new content (dropping `spans`/`paras` when unformatted). */
export function withSpans<T extends { text: string; spans?: TextSpan[]; paras?: ParaStyle[] }>(el: T, spans: TextSpan[], paras: ParaStyle[] | undefined = el.paras): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { spans: _s, paras: _p, ...base } = el;
  return { ...base, ...textFields(spans, paras) } as T;
}

// ─── Fonts ────────────────────────────────────────────────────────────

export const FONT_STACKS: Record<FontFamily, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif',
  serif: '"New York", ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", -apple-system, system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
};

export const FONT_NAMES: Record<FontFamily, string> = { sans: 'System', serif: 'Serif', rounded: 'Rounded', mono: 'Mono' };

export const BASE_WEIGHT = 500;
export const BOLD_WEIGHT = 700;

/** CSS/canvas font shorthand for a run. */
export function fontFor(marks: TextMarks | undefined, size: number, family: FontFamily | string = 'sans') {
  const stack = marks?.code ? FONT_STACKS.mono : FONT_STACKS[family as FontFamily] ?? family;
  return `${marks?.italic ? 'italic ' : ''}${marks?.bold ? BOLD_WEIGHT : BASE_WEIGHT} ${size}px ${stack}`;
}

export type RunMeasure = (text: string, fontSize: number, marks?: TextMarks, font?: FontFamily) => number;

export const lineWidth = (line: TextSpan[], fontSize: number, measure: RunMeasure, font?: FontFamily) =>
  line.reduce((w, r) => w + measure(r.text, fontSize, r.marks, font), 0);

/**
 * Greedy word wrap across runs. A "word" may cross run boundaries
 * (e.g. half-bold), so breaks only happen at whitespace.
 */
export function wrapSpans(spans: TextSpan[], maxW: number, fontSize: number, measure: RunMeasure, font?: FontFamily): TextSpan[][] {
  const out: TextSpan[][] = [];
  for (const para of splitLines(spans)) out.push(...wrapLine(para, maxW, fontSize, measure, font));
  return out;
}

function wrapLine(para: TextSpan[], maxW: number, fontSize: number, measure: RunMeasure, font?: FontFamily): TextSpan[][] {
  if (!Number.isFinite(maxW)) return [para];
  const out: TextSpan[][] = [];
  // Tokens: runs split at whitespace, keeping their marks.
  const tokens: TextSpan[] = [];
  for (const r of para) for (const t of r.text.split(/(\s+)/)) if (t) tokens.push({ text: t, marks: r.marks });
  // Words: consecutive non-space tokens, then any trailing space.
  const words: { body: TextSpan[]; space: TextSpan[] }[] = [];
  for (const t of tokens) {
    const isSpace = !t.text.trim();
    const last = words[words.length - 1];
    if (isSpace) {
      if (last) last.space.push(t);
      else words.push({ body: [], space: [t] });
    } else if (last && !last.space.length) last.body.push(t);
    else words.push({ body: [t], space: [] });
  }
  let line: TextSpan[] = [];
  let w = 0;
  for (const word of words) {
    const bodyW = lineWidth(word.body, fontSize, measure, font);
    if (line.length && w + bodyW > maxW) {
      out.push(trimLine(line));
      line = [];
      w = 0;
    }
    line.push(...word.body, ...word.space);
    w += bodyW + lineWidth(word.space, fontSize, measure, font);
  }
  out.push(trimLine(line));
  return out;
}

function trimLine(line: TextSpan[]): TextSpan[] {
  const out = line.map((r) => ({ ...r }));
  while (out.length && !out[out.length - 1].text.trim()) out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  return out;
}

// ─── Layout ───────────────────────────────────────────────────────────

export const LINE_HEIGHT = 1.3;
/** List indent, in ems. */
export const LIST_INDENT = 1.5;

export interface LaidRun {
  text: string;
  marks?: TextMarks;
  /** Left edge relative to the content box. */
  x: number;
  w: number;
}

export interface LaidLine {
  runs: LaidRun[];
  /** Top of the line box relative to the content box. */
  y: number;
  /** Bullet or number, drawn right-aligned just before `markerX`. */
  marker?: string;
  markerX?: number;
  paragraph: number;
}

export interface TextLayout {
  lines: LaidLine[];
  /** Content size (excludes sticky-note padding). */
  w: number;
  h: number;
  lineHeight: number;
}

export interface LayoutInput {
  text: string;
  spans?: TextSpan[];
  paras?: ParaStyle[];
  fontSize: number;
  font?: FontFamily;
  align?: TextAlign;
}

/**
 * Lay out rich text: wrap (when `maxW` is finite), indent list paragraphs,
 * number them, and place every run for the chosen alignment. Justified
 * lines stretch their word spaces, except the last line of a paragraph.
 */
export function layoutText(el: LayoutInput, measure: RunMeasure, maxW = Infinity): TextLayout {
  const fs = el.fontSize;
  const lh = fs * LINE_HEIGHT;
  const font = el.font;
  const align = el.align ?? 'left';
  const paras = parasOf(el);
  const indent = fs * LIST_INDENT;
  type Pending = { runs: TextSpan[]; w: number; indent: number; marker?: string; paragraph: number; last: boolean };
  const pending: Pending[] = [];
  let number = 0;
  splitLines(spansOf(el)).forEach((para, pi) => {
    const style = paras[pi];
    const ind = style.list ? indent : 0;
    number = style.list === 'number' ? number + 1 : 0;
    const wrapped = wrapLine(para, maxW - ind, fs, measure, font);
    wrapped.forEach((runs, li) => {
      pending.push({
        runs,
        w: lineWidth(runs, fs, measure, font),
        indent: ind,
        marker: li === 0 && style.list ? (style.list === 'bullet' ? '•' : `${number}.`) : undefined,
        paragraph: pi,
        last: li === wrapped.length - 1,
      });
    });
  });
  const contentW = Number.isFinite(maxW) ? maxW : pending.reduce((m, l) => Math.max(m, l.w + l.indent), fs * 0.5);
  const lines: LaidLine[] = pending.map((l, i) => {
    const avail = contentW - l.indent;
    const free = Math.max(0, avail - l.w);
    const justify = align === 'justify' && !l.last && Number.isFinite(maxW);
    let x = l.indent + (align === 'center' ? free / 2 : align === 'right' ? free : 0);
    const runs: LaidRun[] = [];
    if (justify) {
      const tokens: TextSpan[] = [];
      for (const r of l.runs) for (const t of r.text.split(/(\s+)/)) if (t) tokens.push({ text: t, marks: r.marks });
      const gaps = tokens.filter((t) => !t.text.trim()).length;
      const extra = gaps ? free / gaps : 0;
      for (const t of tokens) {
        const w = measure(t.text, fs, t.marks, font);
        const space = !t.text.trim();
        runs.push({ text: t.text, marks: t.marks, x, w: space ? w + extra : w });
        x += space ? w + extra : w;
      }
    } else {
      for (const r of l.runs) {
        const w = measure(r.text, fs, r.marks, font);
        runs.push({ text: r.text, marks: r.marks, x, w });
        x += w;
      }
    }
    const start = l.indent + (align === 'center' ? free / 2 : align === 'right' ? free : 0);
    return { runs, y: i * lh, marker: l.marker, markerX: l.marker ? start - fs * 0.3 : undefined, paragraph: l.paragraph };
  });
  return { lines, w: contentW, h: lines.length * lh, lineHeight: lh };
}

// ─── Editor HTML ⇄ rich text ──────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface RichText {
  spans: TextSpan[];
  paras: ParaStyle[];
}

function runHTML(s: TextSpan, resolve?: (c: ColorToken) => string): string {
  let inner = escapeHtml(s.text);
  for (const spec of MARKS) if (s.marks?.[spec.key]) inner = `<${spec.tag}>${inner}</${spec.tag}>`;
  if (s.marks?.color) {
    const css = resolve ? ` style="color:${escapeHtml(resolve(s.marks.color))}"` : '';
    inner = `<span data-color="${escapeHtml(s.marks.color)}"${css}>${inner}</span>`;
  }
  if (s.marks?.link) inner = `<a href="${escapeHtml(s.marks.link)}">${inner}</a>`;
  return inner;
}

/**
 * HTML for the contenteditable editor: one <div> per paragraph (with its
 * list style as data-list), marks as tags. Empty paragraphs hold a <br>.
 */
export function richToHTML(spans: TextSpan[], paras: ParaStyle[] = [], resolve?: (c: ColorToken) => string): string {
  return splitLines(spans)
    .map((line, i) => {
      const list = paras[i]?.list;
      const body = line.map((r) => runHTML(r, resolve)).join('') || '<br>';
      return `<div${list ? ` data-list="${list}"` : ''}>${body}</div>`;
    })
    .join('');
}

/** Back-compat: rich text as editor HTML without paragraph styles. */
export const spansToHTML = (spans: TextSpan[]) => richToHTML(spans);

const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);
const cleanText = (s: string) => s.replace(/ /g, ' ').replace(/​/g, '');

/** A DOM position (as in Selection/Range). */
export interface DomPoint {
  node: Node;
  offset: number;
}

function markedFrom(el: HTMLElement, marks: TextMarks): TextMarks {
  const next: TextMarks = { ...marks };
  for (const spec of MARKS) {
    if (spec.tags.includes(el.tagName)) next[spec.key] = true;
    const fromStyle = el.style ? spec.fromStyle?.(el.style) : undefined;
    if (fromStyle !== undefined) next[spec.key] = fromStyle;
  }
  if (el.tagName === 'A') {
    const href = safeLink(el.getAttribute('href'));
    if (href) next.link = href;
  }
  const color = el.dataset?.color;
  if (color) next.color = color;
  return next;
}

function styleFrom(el: HTMLElement, inherited: ParaStyle): ParaStyle {
  const list = el.dataset?.list;
  if (list === 'bullet' || list === 'number') return { list };
  if (el.tagName === 'LI') {
    const parent = el.parentElement?.tagName;
    return { list: parent === 'OL' ? 'number' : 'bullet' };
  }
  return inherited;
}

/** A <br> that only props open an empty line (last thing in its block). */
function isPlaceholder(br: Node, root: Node): boolean {
  let n: Node | null = br;
  while (n && n !== root) {
    let next = n.nextSibling;
    while (next && next.nodeType === 3 && !cleanText((next as Text).data)) next = next.nextSibling;
    if (next) return false;
    const parent: Node | null = n.parentNode;
    if (!parent || parent === root) return true;
    if (parent.nodeType === 1 && BLOCK.has((parent as HTMLElement).tagName)) return true;
    n = parent;
  }
  return true;
}

/**
 * Read rich text back from editor DOM (tags, inline styles, <br>, blocks and
 * lists). Optional `points` are DOM positions (e.g. the selection) to map to
 * character offsets in the result.
 */
export function richFromDOM(root: Node, points: DomPoint[] = []): RichText & { offsets: number[] } {
  const paras: { runs: TextSpan[]; style: ParaStyle }[] = [{ runs: [], style: {} }];
  const offsets = points.map(() => -1);
  let fresh = true;
  let pending = false;
  let pos = 0;
  const cur = () => paras[paras.length - 1];
  const start = (style: ParaStyle) => {
    paras.push({ runs: [], style: { ...style } });
    pos += 1;
    fresh = true;
    pending = false;
  };
  const ensure = (style: ParaStyle) => pending && start(style);
  const mark = (node: Node, offset: number) => points.forEach((p, i) => p.node === node && p.offset === offset && offsets[i] < 0 && (offsets[i] = pos));

  const walk = (node: Node, marks: TextMarks, style: ParaStyle) => {
    if (node.nodeType === 3) {
      const data = (node as Text).data;
      const text = cleanText(data);
      points.forEach((p, i) => {
        if (p.node !== node || offsets[i] >= 0) return;
        if (text) ensure(style);
        offsets[i] = pos + cleanText(data.slice(0, p.offset)).length;
      });
      if (!text) return;
      ensure(style);
      cur().runs.push({ text, marks: { ...marks } });
      pos += text.length;
      fresh = false;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      ensure(style);
      if (!isPlaceholder(el, root)) start(style);
      else fresh = false;
      return;
    }
    const block = BLOCK.has(el.tagName) && el !== root;
    const nextStyle = block ? styleFrom(el, style) : style;
    if (block && el.tagName !== 'UL' && el.tagName !== 'OL') {
      if (!fresh || pending) start(nextStyle);
      else cur().style = { ...nextStyle };
    }
    const next = markedFrom(el, marks);
    el.childNodes.forEach((c, i) => {
      mark(el, i);
      walk(c, next, nextStyle);
    });
    mark(el, el.childNodes.length);
    if (block) pending = true;
  };
  if (root.nodeType === 1) {
    root.childNodes.forEach((c, i) => {
      mark(root, i);
      walk(c, {}, {});
    });
    mark(root, root.childNodes.length);
  }
  const spans: TextSpan[] = [];
  paras.forEach((p, i) => {
    if (i > 0) spans.push({ text: '\n' });
    spans.push(...p.runs);
  });
  const text = paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
  return { spans: normalizeSpans(spans), paras: paras.map((p) => cleanPara(p.style)), offsets: offsets.map((o) => Math.min(Math.max(0, o), text.length)) };
}

/** Back-compat: spans only. */
export const spansFromDOM = (root: Node): TextSpan[] => richFromDOM(root).spans;

/** DOM position for character offset `at` in HTML produced by `richToHTML`. */
export function locateOffset(root: HTMLElement, at: number): DomPoint {
  const blocks = [...root.children] as HTMLElement[];
  let pos = 0;
  for (let b = 0; b < blocks.length; b++) {
    const len = cleanText(blocks[b].textContent ?? '').length;
    if (at <= pos + len || b === blocks.length - 1) {
      let rest = Math.min(at - pos, len);
      const walker = document.createTreeWalker(blocks[b], NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        if (rest <= n.data.length) return { node: n, offset: rest };
        rest -= n.data.length;
        last = n;
      }
      return last ? { node: last, offset: last.data.length } : { node: blocks[b], offset: 0 };
    }
    pos += len + 1;
  }
  return { node: root, offset: root.childNodes.length };
}
