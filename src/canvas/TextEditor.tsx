import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { notePad, worldToScreen } from '../engine/geometry';
import {
  BOOL_MARKS,
  FONT_STACKS,
  locateOffset,
  marksAt,
  paraIndexAt,
  parasOf,
  plainText,
  rangeHas,
  rangeValue,
  replaceParas,
  replaceRange,
  richFromDOM,
  richToHTML,
  safeLink,
  setMarkRange,
  spansOf,
  toggleListRange,
  trimEndSpans,
  withSpans,
  type BoolMark,
  type RichText,
} from '../engine/richtext';
import { boardTheme, type Appearance } from '../engine/theme';
import type { ColorToken, TextAlign, TextElement, TextMarks } from '../engine/types';
import { board, useBoard } from '../state/board';
import { ALIGNS, ColorButton, FORMAT_KEYS, FormatButtons, keepFocus, LinkButton, stepSize, TextStyleButton, type MarkState, type TextStyleState } from '../ui/FormatBar';
import { Divider } from '../ui/controls';
import { getController } from './instance';

export interface EditRequest {
  element: TextElement;
  isNew: boolean;
}

const BAR_H = 52;
const BAR_GAP = 10;
/** Keep the format bar clear of the top toolbars. */
const TOP_CLEAR = 76;

type Sel = [number, number];
interface Snapshot {
  rich: RichText;
  sel: Sel;
}

/**
 * Rich text editor overlaid exactly where the text renders on canvas, so
 * editing feels like typing on the board itself. A compact format bar
 * floats above it.
 *
 * Typing is native contenteditable; every format command goes through the
 * rich text model (read the DOM → change spans → write canonical HTML →
 * restore the selection), so what you see is exactly what gets stored.
 */
export function TextEditor({ request, onDone, appearance }: { request: EditRequest; onDone: () => void; appearance: Appearance }) {
  const { element, isNew } = request;
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [empty, setEmpty] = useState(!element.text);
  const [marks, setMarks] = useState<MarkState>({});
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [barW, setBarW] = useState(320);
  const [style, setStyleState] = useState<TextStyleState & { color: ColorToken }>({
    font: element.font ?? 'sans',
    fontSize: element.fontSize,
    align: element.align ?? 'left',
    wraps: !!element.note,
    color: element.color,
  });
  const styleRef = useRef(style);
  styleRef.current = style;
  /** Marks for the next typed text (a format toggled with no selection). */
  const pending = useRef<{ marks: TextMarks; at: number } | null>(null);
  const history = useRef<{ undo: Snapshot[]; redo: Snapshot[]; lastInput: number }>({ undo: [], redo: [], lastInput: 0 });
  /** Selection saved while focus is in the link field. */
  const savedSel = useRef<Sel | null>(null);
  // Re-render on camera moves so the editor tracks the board.
  useBoard((b) => b.page.camera);
  const cam = board.page.camera;
  const theme = boardTheme(appearance);
  const resolve = theme.resolve;

  // ─── Model ⇄ DOM ────────────────────────────────────────────────

  const read = useCallback((): Snapshot => {
    const root = ref.current!;
    const s = window.getSelection();
    const inside = !!s && s.rangeCount > 0 && root.contains(s.anchorNode) && root.contains(s.focusNode);
    const points = inside ? [{ node: s!.anchorNode!, offset: s!.anchorOffset }, { node: s!.focusNode!, offset: s!.focusOffset }] : [];
    const r = richFromDOM(root, points);
    const len = plainText(r.spans).length;
    const sel: Sel = inside ? [Math.min(r.offsets[0], r.offsets[1]), Math.max(r.offsets[0], r.offsets[1])] : savedSel.current ?? [len, len];
    return { rich: { spans: r.spans, paras: r.paras }, sel };
  }, []);

  const select = (sel: Sel) => {
    const root = ref.current!;
    const a = locateOffset(root, sel[0]);
    const b = locateOffset(root, sel[1]);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  };

  const refreshMarks = useCallback(() => {
    if (!ref.current) return;
    const { rich, sel } = read();
    const [a, b] = sel;
    const out: MarkState = {};
    if (a !== b) {
      for (const k of BOOL_MARKS) out[k] = rangeHas(rich.spans, a, b, k);
      out.link = rangeValue(rich.spans, a, b, 'link') as string | undefined;
      out.color = rangeValue(rich.spans, a, b, 'color') as string | undefined;
    } else {
      const m = pending.current?.at === a ? pending.current.marks : marksAt(rich.spans, a);
      for (const k of BOOL_MARKS) out[k] = !!m?.[k];
      out.color = m?.color;
      out.link = (rangeValue(rich.spans, Math.max(0, a - 1), a + 1, 'link') as string | undefined) ?? undefined;
    }
    const text = plainText(rich.spans);
    const lists = parasOf({ text, paras: rich.paras }).slice(paraIndexAt(text, a), paraIndexAt(text, b) + 1);
    out.list = lists.length && lists.every((p) => p.list === lists[0].list) ? lists[0].list : undefined;
    setMarks(out);
  }, [read]);

  const write = (snap: Snapshot, record = true) => {
    const root = ref.current!;
    if (record) {
      history.current.undo.push(read());
      history.current.redo = [];
      history.current.lastInput = 0;
    }
    root.innerHTML = richToHTML(snap.rich.spans, snap.rich.paras, resolve);
    select(snap.sel);
    setEmpty(!plainText(snap.rich.spans));
    refreshMarks();
  };

  // ─── Setup ──────────────────────────────────────────────────────

  useLayoutEffect(() => {
    getController()?.setHidden(isNew ? [] : [element.id]);
    const el = ref.current;
    if (el) {
      el.innerHTML = richToHTML(spansOf(element), parasOf(element), resolve);
      el.focus();
      const len = element.text.length;
      select([len, len]);
    }
    return () => getController()?.setHidden([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, isNew]);

  // Colors are written as resolved CSS; re-resolve when the appearance flips.
  useEffect(() => {
    if (!ref.current) return;
    const snap = read();
    ref.current.innerHTML = richToHTML(snap.rich.spans, snap.rich.paras, resolve);
    if (document.activeElement === ref.current) select(snap.sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance]);

  const commit = useCallback(() => {
    if (done.current || !ref.current) return;
    done.current = true;
    const { rich } = read();
    const st = styleRef.current;
    const base: TextElement = { ...element, fontSize: st.fontSize, color: st.color, font: st.font === 'sans' ? undefined : st.font, align: st.align === 'left' ? undefined : st.align };
    if (!base.font) delete base.font;
    if (!base.align) delete base.align;
    const next = withSpans(base, trimEndSpans(rich.spans), rich.paras);
    if (!next.text.trim()) {
      if (!isNew) board.removeElements([element.id]);
    } else if (isNew) {
      board.addElements([next]);
    } else if (JSON.stringify(next) !== JSON.stringify(element)) {
      board.replaceElements([next]);
    }
    onDone();
  }, [element, isNew, onDone, read]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSel = () => {
      if (document.activeElement !== el) return;
      const p = pending.current;
      if (p) {
        const { sel } = read();
        if (sel[0] !== p.at || sel[1] !== p.at) pending.current = null;
      }
      refreshMarks();
    };
    document.addEventListener('selectionchange', onSel);
    const ro = new ResizeObserver(() => setBox({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    const bar = barRef.current;
    const barRo = bar ? new ResizeObserver(() => setBarW(bar.offsetWidth)) : null;
    if (bar) barRo!.observe(bar);
    // Taps outside the editor and its chrome end the edit (even from the link field).
    const outside = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || el.contains(t) || t.closest?.('[data-editor-chrome]')) return;
      commit();
    };
    window.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      window.removeEventListener('pointerdown', outside, true);
      ro.disconnect();
      barRo?.disconnect();
    };
  }, [commit, read, refreshMarks]);

  // ─── Commands ───────────────────────────────────────────────────

  const toggle = (key: BoolMark) => {
    const snap = read();
    const [a, b] = snap.sel;
    if (a !== b) {
      const on = !rangeHas(snap.rich.spans, a, b, key);
      write({ rich: { ...snap.rich, spans: setMarkRange(snap.rich.spans, a, b, key, on) }, sel: snap.sel });
      return;
    }
    const base = pending.current?.at === a ? pending.current.marks : marksAt(snap.rich.spans, a) ?? {};
    pending.current = { marks: { ...base, [key]: !base[key] }, at: a };
    refreshMarks();
  };

  const setColor = (c: ColorToken) => {
    const snap = read();
    const [a, b] = snap.sel;
    if (a !== b) write({ rich: { ...snap.rich, spans: setMarkRange(snap.rich.spans, a, b, 'color', c === styleRef.current.color ? undefined : c) }, sel: snap.sel });
    else {
      // No selection: recolor the whole text.
      setStyle({ color: c });
      write({ rich: { ...snap.rich, spans: setMarkRange(snap.rich.spans, 0, plainText(snap.rich.spans).length, 'color', undefined) }, sel: snap.sel });
    }
  };

  const refocus = () => {
    const saved = savedSel.current;
    ref.current?.focus();
    if (saved) select(saved);
    savedSel.current = null;
  };

  const setLink = (url: string | null) => {
    refocus();
    const snap = read();
    let [a, b] = snap.sel;
    const spans = snap.rich.spans;
    if (url === null) {
      // Remove the link under the caret or selection (whole link when collapsed).
      if (a === b) {
        const text = plainText(spans);
        const href = rangeValue(spans, Math.max(0, a - 1), Math.min(text.length, a + 1), 'link');
        let pos = 0;
        for (const s of spans) {
          const end = pos + s.text.length;
          if (s.marks?.link === href && end >= a && pos <= a) {
            a = Math.min(a, pos);
            b = Math.max(b, end);
          }
          pos = end;
        }
      }
      write({ rich: { ...snap.rich, spans: setMarkRange(spans, a, b, 'link', undefined) }, sel: snap.sel });
      return;
    }
    const href = safeLink(url);
    if (!href) return;
    if (a !== b) write({ rich: { ...snap.rich, spans: setMarkRange(spans, a, b, 'link', href) }, sel: snap.sel });
    else {
      const label = url.replace(/^https?:\/\//, '');
      write({
        rich: { spans: replaceRange(spans, a, a, label, { ...marksAt(spans, a), link: href }), paras: snap.rich.paras },
        sel: [a + label.length, a + label.length],
      });
    }
  };

  const toggleList = (list: 'bullet' | 'number') => {
    const snap = read();
    const text = plainText(snap.rich.spans);
    write({ rich: { ...snap.rich, paras: toggleListRange(snap.rich.paras, text, snap.sel[0], snap.sel[1], list) }, sel: snap.sel });
  };

  const setStyle = (patch: Partial<TextStyleState & { color: ColorToken }>) => setStyleState((s) => ({ ...s, ...patch }));

  /** Replace the selection with text (typing, paste, Enter), keeping lists aligned. */
  const insert = (text: string, marks?: TextMarks) => {
    const snap = read();
    const [a, b] = snap.sel;
    const whole = plainText(snap.rich.spans);
    const m = marks ?? (pending.current?.at === a ? pending.current.marks : marksAt(snap.rich.spans, a));
    pending.current = null;
    write({
      rich: { spans: replaceRange(snap.rich.spans, a, b, text, m), paras: replaceParas(parasOf({ text: whole, paras: snap.rich.paras }), whole, a, b, text) },
      sel: [a + text.length, a + text.length],
    });
  };

  const newParagraph = () => {
    const snap = read();
    const [a, b] = snap.sel;
    const text = plainText(snap.rich.spans);
    const pi = paraIndexAt(text, a);
    const paras = parasOf({ text, paras: snap.rich.paras });
    // Return on an empty list item ends the list (Notes behaviour).
    if (a === b && paras[pi].list && !text.split('\n')[pi]) {
      write({ rich: { ...snap.rich, paras: paras.map((p, i) => (i === pi ? {} : p)) }, sel: snap.sel });
      return;
    }
    const m = pending.current?.at === a ? pending.current.marks : marksAt(snap.rich.spans, a);
    write({
      rich: { spans: replaceRange(snap.rich.spans, a, b, '\n'), paras: replaceParas(paras, text, a, b, '\n') },
      sel: [a + 1, a + 1],
    });
    if (m) pending.current = { marks: m, at: a + 1 };
  };

  const restore = (from: Snapshot[], to: Snapshot[]) => {
    const snap = from.pop();
    if (!snap) return;
    to.push(read());
    write(snap, false);
  };

  // Native beforeinput: typing with pending marks, Enter, deletes at list starts.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => {
      const h = history.current;
      switch (e.inputType) {
        case 'insertText': {
          const snap = read();
          if (pending.current && pending.current.at === snap.sel[0] && e.data) {
            e.preventDefault();
            insert(e.data);
            return;
          }
          break;
        }
        case 'insertParagraph':
        case 'insertLineBreak':
          e.preventDefault();
          newParagraph();
          return;
        case 'deleteContentBackward': {
          const snap = read();
          const [a, b] = snap.sel;
          const text = plainText(snap.rich.spans);
          const pi = paraIndexAt(text, a);
          const paras = parasOf({ text, paras: snap.rich.paras });
          const atStart = a === b && (a === 0 || text[a - 1] === '\n');
          if (atStart && paras[pi].list) {
            e.preventDefault();
            write({ rich: { ...snap.rich, paras: paras.map((p, i) => (i === pi ? {} : p)) }, sel: snap.sel });
            return;
          }
          break;
        }
        case 'historyUndo':
          e.preventDefault();
          restore(h.undo, h.redo);
          return;
        case 'historyRedo':
          e.preventDefault();
          restore(h.redo, h.undo);
          return;
        case 'formatBold':
        case 'formatItalic':
        case 'formatUnderline':
        case 'formatStrikeThrough':
          e.preventDefault();
          toggle(({ formatBold: 'bold', formatItalic: 'italic', formatUnderline: 'underline', formatStrikeThrough: 'strike' } as const)[e.inputType]);
          return;
      }
      // Native edits: snapshot at the start of each typing burst.
      const now = performance.now();
      if (now - h.lastInput > 900) {
        h.undo.push(read());
        h.redo = [];
      }
      h.lastInput = now;
    };
    el.addEventListener('beforeinput', onBefore);
    return () => el.removeEventListener('beforeinput', onBefore);
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
      e.preventDefault();
      commit();
      return;
    }
    if (!mod) return;
    const fmt = FORMAT_KEYS[k];
    if (fmt && fmt.shift === e.shiftKey) {
      e.preventDefault();
      toggle(fmt.mark);
      return;
    }
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) restore(history.current.redo, history.current.undo);
      else restore(history.current.undo, history.current.redo);
      return;
    }
    if (k === 'y') {
      e.preventDefault();
      restore(history.current.redo, history.current.undo);
      return;
    }
    if (k === 'k') {
      e.preventDefault();
      if (marks.link) setLink(null);
      else barRef.current?.querySelector<HTMLButtonElement>('[aria-label="Add link"]')?.click();
      return;
    }
    if (e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8')) {
      e.preventDefault();
      toggleList(e.code === 'Digit7' ? 'number' : 'bullet');
      return;
    }
    if (e.shiftKey) {
      const align = ({ KeyL: 'left', KeyE: 'center', KeyR: 'right', KeyJ: 'justify' } as Record<string, TextAlign>)[e.code];
      if (align && (align !== 'justify' || style.wraps)) {
        e.preventDefault();
        setStyle({ align });
        return;
      }
    }
    if (e.key === '=' || e.key === '+' || e.key === '-') {
      e.preventDefault();
      setStyle({ fontSize: stepSize(style.fontSize, e.key === '-' ? -1 : 1) });
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    insert(e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
  };

  const onInput = () => {
    const el = ref.current;
    if (el) setEmpty(!el.textContent);
  };

  // ─── Layout ─────────────────────────────────────────────────────

  const p = worldToScreen(cam, element.x, element.y);
  const fontPx = style.fontSize * cam.z;
  const color = resolve(style.color);
  const note = element.note;
  const boxW = note ? note.w * cam.z : box.w;
  const boxH = note ? note.h * cam.z : box.h;

  // Format bar: above the text, or below it when there's no room.
  const above = p.y - BAR_H - BAR_GAP >= TOP_CLEAR;
  const barTop = above ? p.y - BAR_H - BAR_GAP : p.y + boxH + BAR_GAP;
  const barLeft = Math.max(12, Math.min(p.x, window.innerWidth - 12 - barW));

  const editorStyle: React.CSSProperties = {
    fontSize: fontPx,
    color,
    fontFamily: FONT_STACKS[style.font],
    textAlign: style.align,
    ['--code-fill' as string]: appearance === 'dark' ? 'rgba(235,235,245,0.14)' : 'rgba(60,60,67,0.09)',
    ['--mark-fill' as string]: appearance === 'dark' ? 'rgba(255,214,10,0.4)' : 'rgba(255,204,0,0.5)',
    ['--link' as string]: resolve('blue'),
  };

  const editor = (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={note ? 'Sticky note text' : 'Text'}
      data-placeholder={note ? 'Note' : 'Type'}
      data-empty={empty}
      spellCheck
      onBlur={(e) => {
        const to = e.relatedTarget as Element | null;
        if (to?.closest?.('[data-editor-chrome]')) {
          // Focus moved into the link field: remember where the selection was.
          savedSel.current = read().sel;
          return;
        }
        commit();
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onInput={onInput}
      className={`board-editor ${note ? 'h-full w-full' : 'absolute z-10'}`}
      style={
        note
          ? { ...editorStyle, padding: notePad(note) * cam.z, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }
          : { ...editorStyle, left: p.x, top: p.y, minWidth: fontPx * 2 }
      }
    />
  );

  const alignIcon = ALIGNS.find((a) => a.value === style.align)?.icon;
  const bar = createPortal(
    <div
      ref={barRef}
      data-editor-chrome
      className="sheet pop-in fixed z-40 flex max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto rounded-full! p-1 [scrollbar-width:none]"
      style={{ left: barLeft, top: barTop, ['--origin' as string]: above ? '0% 100%' : '0% 0%' }}
      role="toolbar"
      aria-label="Text format"
      onPointerDown={keepFocus}
    >
      <FormatButtons state={marks} onToggle={(f) => toggle(f.mark)} />
      <Divider />
      <ColorButton value={marks.color ?? style.color} onPick={setColor} appearance={appearance} />
      <LinkButton
        current={marks.link}
        onLink={setLink}
        onCancel={refocus}
      />
      <TextStyleButton style={style} marks={marks} onStyle={setStyle} onToggle={(f) => toggle(f.mark)} onList={toggleList} />
      {alignIcon && style.align !== 'left' && <span className="sr-only">Aligned {style.align}</span>}
    </div>,
    document.getElementById('overlay') ?? document.body,
  );

  if (note) {
    return (
      <>
        <div
          className="pop-in absolute z-10 overflow-hidden"
          style={{
            left: p.x,
            top: p.y,
            width: boxW,
            height: boxH,
            background: theme.noteFill(note.tint),
            borderRadius: Math.min(14, note.w * 0.06) * cam.z,
            boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
            ['--origin' as string]: '50% 50%',
          }}
        >
          {editor}
        </div>
        {bar}
      </>
    );
  }

  return (
    <>
      {editor}
      {bar}
    </>
  );
}
