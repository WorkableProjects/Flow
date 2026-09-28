// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  layoutText,
  locateOffset,
  marksAt,
  plainText,
  rangeHas,
  replaceParas,
  replaceRange,
  richFromDOM,
  richToHTML,
  safeLink,
  setMarkRange,
  textFields,
  toggleListRange,
} from './richtext';
import { BoardStore, sanitizeDocument } from './store';
import type { FlowDocument, TextSpan } from './types';

const measure = (t: string, size: number) => t.length * size * 0.5;

const dom = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

describe('rich text editing model', () => {
  it('applies a mark to a character range, splitting runs', () => {
    const s = setMarkRange([{ text: 'hello world' }], 6, 11, 'strike', true);
    expect(s).toEqual([{ text: 'hello ' }, { text: 'world', marks: { strike: true } }]);
    expect(rangeHas(s, 6, 11, 'strike')).toBe(true);
    expect(rangeHas(s, 0, 11, 'strike')).toBe(false);
  });

  it('stores run color and links, but only safe links', () => {
    const s = setMarkRange(setMarkRange([{ text: 'ab' }], 0, 1, 'color', 'red'), 1, 2, 'link', 'example.com');
    expect(s).toEqual([{ text: 'a', marks: { color: 'red' } }, { text: 'b', marks: { link: 'https://example.com' } }]);
    expect(safeLink('javascript:alert(1)')).toBeUndefined();
    expect(safeLink('me@site.org')).toBe('mailto:me@site.org');
  });

  it('continues marks when typing, but not links', () => {
    const s: TextSpan[] = [{ text: 'ab', marks: { bold: true, link: 'https://a.b' } }];
    expect(marksAt(s, 2)).toEqual({ bold: true });
    expect(plainText(replaceRange(s, 1, 1, 'X', { italic: true }))).toBe('aXb');
  });

  it('keeps paragraph styles aligned when inserting lines', () => {
    const text = 'one\ntwo';
    const paras = toggleListRange([], text, 0, 5, 'bullet');
    expect(paras).toEqual([{ list: 'bullet' }, { list: 'bullet' }]);
    expect(replaceParas(paras, text, 3, 3, '\n')).toHaveLength(3);
    expect(toggleListRange(paras, text, 0, 0, 'bullet')).toEqual([{}, { list: 'bullet' }]);
    expect(textFields([{ text }], [{}, {}])).toEqual({ text });
  });

  it('round-trips editor HTML: marks, colors, links and lists', () => {
    const spans: TextSpan[] = [
      { text: 'Rich ', marks: { bold: true } },
      { text: 'code', marks: { code: true, color: 'blue' } },
      { text: '\n' },
      { text: 'site', marks: { link: 'https://flow.app', highlight: true } },
      { text: '\n' },
    ];
    const paras = [{ list: 'number' as const }, {}, {}];
    const back = richFromDOM(dom(richToHTML(spans, paras)));
    expect(back.spans).toEqual(spans.slice(0, 4).concat({ text: '\n' }));
    expect(back.paras).toEqual([{ list: 'number' }, {}, {}]);
  });

  it('reads flat <br> HTML, lists and pasted blocks', () => {
    expect(plainText(richFromDOM(dom('a<br>b<br><br>')).spans)).toBe('a\nb\n');
    const r = richFromDOM(dom('<ul><li>x</li><li>y</li></ul><ol><li>z</li></ol>'));
    expect(plainText(r.spans)).toBe('x\ny\nz');
    expect(r.paras).toEqual([{ list: 'bullet' }, { list: 'bullet' }, { list: 'number' }]);
    expect(richFromDOM(dom('<div><s>gone</s> <mark>hi</mark></div>')).spans).toEqual([
      { text: 'gone', marks: { strike: true } },
      { text: ' ' },
      { text: 'hi', marks: { highlight: true } },
    ]);
  });

  it('maps the selection to character offsets and back', () => {
    const root = dom(richToHTML([{ text: 'ab\n' }, { text: 'cd', marks: { bold: true } }]));
    const b = root.querySelector('b')!.firstChild!;
    const { offsets } = richFromDOM(root, [{ node: b, offset: 1 }, { node: root.children[1], offset: 0 }]);
    expect(offsets).toEqual([4, 3]);
    const p = locateOffset(root, 4);
    expect(p.node).toBe(b);
    expect(p.offset).toBe(1);
    expect(locateOffset(root, 3)).toEqual({ node: b, offset: 0 });
  });

  it('lays out lists, alignment and justification', () => {
    const l = layoutText({ text: 'a\nb\nc', fontSize: 10, paras: [{ list: 'number' }, { list: 'number' }, {}] }, measure);
    expect(l.lines.map((x) => x.marker)).toEqual(['1.', '2.', undefined]);
    expect(l.lines[0].runs[0].x).toBe(15);
    const c = layoutText({ text: 'aaaa\nbb', fontSize: 10, align: 'center' }, measure);
    expect(c.lines[1].runs[0].x).toBe(5);
    const j = layoutText({ text: 'aa bb cc dd', fontSize: 10, align: 'justify' }, measure, 55);
    const first = j.lines[0].runs;
    const last = first[first.length - 1];
    expect(last.x + last.w).toBeCloseTo(55);
    expect(j.lines[j.lines.length - 1].runs[0].x).toBe(0);
  });
});

describe('store refinements', () => {
  it('folds a transaction into one undo step', () => {
    const s = new BoardStore();
    s.transaction(() => {
      s.addElements([{ id: 'a', type: 'dot', x: 0, y: 0, r: 1, color: 'label' }]);
      s.addElements([{ id: 'b', type: 'dot', x: 1, y: 0, r: 1, color: 'label' }]);
    });
    expect(s.page.elements).toHaveLength(2);
    s.undo();
    expect(s.page.elements).toHaveLength(0);
    s.redo();
    expect(s.page.elements.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('page reordering is undoable', () => {
    const s = new BoardStore();
    s.addPage();
    const ids = s.doc.pages.map((p) => p.id);
    s.movePage(ids[1], -1);
    expect(s.doc.pages.map((p) => p.id)).toEqual([ids[1], ids[0]]);
    s.undo();
    expect(s.doc.pages.map((p) => p.id)).toEqual(ids);
  });

  it('sanitizes untrusted text content', () => {
    const doc = new BoardStore().doc as FlowDocument;
    doc.pages[0].elements = [
      { id: 't', type: 'text', x: 0, y: 0, text: 'x', color: 'label', fontSize: 10, spans: [{ text: 'x', marks: { link: 'javascript:bad()' } }] },
    ];
    const el = sanitizeDocument(doc).pages[0].elements[0];
    expect(el).toEqual({ id: 't', type: 'text', x: 0, y: 0, text: 'x', color: 'label', fontSize: 10 });
  });
});
