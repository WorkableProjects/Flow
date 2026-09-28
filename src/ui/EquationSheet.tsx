import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getController } from '../canvas/instance';
import { uid } from '../engine/geometry';
import { EM_PX, loadTex, toMathML, typeset, type MathMode, type TypesetResult } from '../engine/latex';
import { LIBRARY, SYMBOLS } from '../engine/mathLibrary';
import { toast } from '../state/ui';
import { BubbleGroup } from './Bubble';
import { equationDataUrl } from '../engine/renderer';
import { swatch, type Appearance } from '../engine/theme';
import type { EquationElement } from '../engine/types';
import { usePresence } from '../hooks/usePresence';
import { Icon } from '../icons/Icon';
import { board } from '../state/board';
import { ui, useUI } from '../state/ui';
import { ToolButton } from './controls';

const EXAMPLE = String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`;

/** Board units per em for an equation already on the board (keeps its size when re-edited). */
function emSizeOf(el: EquationElement) {
  const wPx = parseFloat(el.svg.match(/\swidth="([\d.]+)px"/)?.[1] ?? '');
  return wPx ? el.w / (wPx / EM_PX) : el.h;
}

/**
 * LaTeX Equation app: type TeX, see it typeset live, and place it on the
 * board as a vector object you can move, resize and re-edit.
 */
export function EquationSheet({ appearance }: { appearance: Appearance }) {
  const { open, editId } = useUI((s) => s.equation);
  const timerOpen = useUI((s) => s.timerOpen);
  const { mounted, leaving } = usePresence(open);
  const editing = useMemo(() => (editId ? (board.page.elements.find((e) => e.id === editId && e.type === 'equation') as EquationElement | undefined) : undefined), [editId]);
  const [source, setSource] = useState('');
  const [result, setResult] = useState<TypesetResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<MathMode>('block');
  const [tab, setTab] = useState<string>(SYMBOLS[0].group);
  const input = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<HTMLElement>(null);

  // Fresh state each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSource(editing?.latex ?? '');
    setMode(editing?.mode ?? 'block');
    setResult(null);
    setError('');
    setLoading(true);
    loadTex()
      .catch(() => setError('The equation typesetter couldn’t load. Check your connection.'))
      .finally(() => setLoading(false));
    requestAnimationFrame(() => {
      const t = input.current;
      if (t) {
        t.focus();
        t.setSelectionRange(t.value.length, t.value.length);
      }
    });
  }, [open, editing]);

  // Live preview, lightly debounced.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const t = window.setTimeout(async () => {
      const r = await typeset(source, mode);
      if (stale) return;
      if ('error' in r) {
        setResult(null);
        setError(r.error);
      } else {
        setResult(r);
        setError('');
      }
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [source, open, loading, mode]);

  const close = () => {
    // Hand the keyboard back to the board while the sheet animates out.
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheet.current?.contains(active)) active.blur();
    ui.set({ equation: { open: false, editId: null } });
  };

  const insertSnippet = (tex: string) => {
    const t = input.current;
    if (!t) return;
    const caret = tex.indexOf('|');
    const clean = tex.replace('|', '');
    const start = t.selectionStart, end = t.selectionEnd;
    const next = source.slice(0, start) + clean + source.slice(end);
    setSource(next);
    requestAnimationFrame(() => {
      t.focus();
      const at = start + (caret >= 0 ? caret : clean.length);
      t.setSelectionRange(at, at);
    });
  };

  const place = () => {
    if (!result) return;
    const color = editing?.color ?? ui.get().text.color;
    if (editing) {
      const em = emSizeOf(editing);
      const next: EquationElement = { ...editing, latex: source.trim(), svg: result.svg, w: result.wEm * em, h: result.hEm * em, color, mode };
      if (mode === 'block') delete next.mode;
      board.replaceElements([next]);
      ui.set({ tool: 'select', selection: new Set([next.id]) });
    } else {
      const z = board.page.camera.z;
      const em = (Math.max(22, ui.get().text.size) * 1.2) / z;
      const c = getController()?.worldCenter() ?? { x: 0, y: 0 };
      const w = result.wEm * em, h = result.hEm * em;
      const el: EquationElement = { id: uid(), type: 'equation', x: c.x - w / 2, y: c.y - h / 2, w, h, latex: source.trim(), svg: result.svg, color, ...(mode === 'inline' ? { mode } : {}) };
      board.addElements([el]);
      ui.set({ tool: 'select', selection: new Set([el.id]) });
    }
    close();
  };

  const copyMathML = async () => {
    try {
      await navigator.clipboard.writeText(await toMathML(source, mode));
      toast('MathML copied');
    } catch {
      toast('Couldn’t copy MathML');
    }
  };

  const palette = tab === 'Library' ? null : SYMBOLS.find((g) => g.group === tab) ?? SYMBOLS[0];

  if (!mounted) return null;
  const previewColor = swatch('label', appearance);

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-label="LaTeX equation"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex w-[440px] max-w-[calc(100vw-32px)] flex-col p-4 max-sm:right-3 max-sm:max-w-[calc(100vw-24px)]`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          place();
        }
      }}
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-tint text-white">
          <Icon name="equation" size={19} />
        </span>
        <h2 className="flex-1 text-headline font-semibold tracking-title">{editing ? 'Edit Equation' : 'LaTeX Equation'}</h2>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>

      <label className="mt-3 block">
        <span className="sr-only">LaTeX source</span>
        <textarea
          ref={input}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={EXAMPLE}
          rows={3}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="LaTeX source"
          className="block w-full resize-none rounded-[14px] bg-fill px-3.5 py-3 font-mono text-[15px] leading-snug text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--tint)]"
        />
      </label>

      <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Palette">
        {[...SYMBOLS.map((g) => g.group), 'Library'].map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={tab === g}
            onClick={() => setTab(g)}
            className={`spring h-8 shrink-0 rounded-full px-3 text-footnote font-semibold ${tab === g ? 'bg-tint-soft text-on-tint-soft' : 'text-label-2 hover:bg-fill'}`}
          >
            {g === 'Library' ? '★ Library' : g}
          </button>
        ))}
      </div>

      {palette ? (
        <div className="mt-1 grid max-h-[124px] grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1 overflow-y-auto pr-0.5" role="tabpanel" aria-label={`${palette.group} symbols`} style={{ touchAction: 'pan-y' }}>
          {palette.items.map((s) => (
            <button
              key={s.label + s.tex}
              type="button"
              title={s.tex.replace('|', '').trim()}
              aria-label={s.tex.replace('|', '').trim()}
              onClick={() => insertSnippet(s.tex)}
              className="spring h-10 min-w-11 rounded-[10px] bg-fill px-2 text-subhead font-semibold whitespace-nowrap text-label hover:bg-fill-2 active:scale-[0.94]"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-1 max-h-[200px] overflow-y-auto rounded-[14px] bg-cell shadow-[0_0_0_0.5px_var(--hairline)]" role="tabpanel" aria-label="Equation library" style={{ touchAction: 'pan-y' }}>
          {LIBRARY.map((g) => (
            <div key={g.group}>
              <p className="sticky top-0 bg-cell/95 px-3 pt-2 pb-1 text-caption font-semibold tracking-wide text-label-2 uppercase">{g.group}</p>
              {g.items.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    setSource(t.tex);
                    requestAnimationFrame(() => input.current?.focus());
                  }}
                  className="spring flex min-h-11 w-full items-center justify-between gap-3 border-b border-hairline px-3 text-left last:border-0 hover:bg-fill"
                >
                  <span className="text-subhead text-label">{t.name}</span>
                  <code className="max-w-[55%] truncate font-mono text-caption text-label-2">{t.tex}</code>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div
        className="mt-2 flex min-h-[112px] items-center justify-center overflow-auto rounded-[18px] bg-bg p-4 shadow-[inset_0_0_0_0.5px_var(--hairline)]"
        aria-live="polite"
      >
        {result ? (
          <img
            key={result.svg}
            src={equationDataUrl(result.svg, previewColor)}
            alt={source}
            className="fade-in max-w-full"
            style={{ width: Math.min(result.wEm, 180 / 30 * (result.wEm / result.hEm)) * 30, height: 'auto' }}
            draggable={false}
          />
        ) : error ? (
          <p className="text-center text-footnote font-medium text-danger">{error}</p>
        ) : (
          <p className="text-center text-footnote text-label-2">{loading ? 'Loading typesetter…' : 'Your equation appears here as you type.'}</p>
        )}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2">
        <BubbleGroup active={mode} variant="raised" role="radiogroup" label="Display mode" className="flex rounded-full bg-fill p-0.5">
          {(['block', 'inline'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              data-bubble={m}
              title={m === 'block' ? 'Display style: large limits and fractions' : 'Inline style: compact, sits in a line of text'}
              onClick={() => setMode(m)}
              className={`spring relative flex h-9 items-center rounded-full px-3 text-footnote font-semibold ${mode === m ? 'text-label' : 'text-label-2 hover:text-label'}`}
            >
              {m === 'block' ? 'Block' : 'Inline'}
            </button>
          ))}
        </BubbleGroup>
        <ToolButton icon="clipboard" iconSize={17} label="Copy as MathML" disabled={!result} onClick={copyMathML} />
        <p className="ml-auto text-footnote text-label-2 max-sm:hidden mobile:hidden">⌘↩</p>
        <button
          type="button"
          disabled={!result}
          onClick={place}
          className="spring flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-headline font-semibold text-white shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-105 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
        >
          {editing ? 'Update' : 'Insert'}
        </button>
      </footer>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}
