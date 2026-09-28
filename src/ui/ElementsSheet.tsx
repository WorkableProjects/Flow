import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getController } from '../canvas/instance';
import { configurationText, elementByZ, findElement, MAX_Z } from '../engine/chem';
import { elementBounds, inflate, unionRects } from '../engine/geometry';
import { bohrElement, bohrModel, elementTile, MAX_ENERGY_LEVELS, orbitalDiagram, type OrbitalStyle } from '../engine/presets';
import { elementsToSvg } from '../engine/svg';
import { boardTheme, type Appearance } from '../engine/theme';
import type { BoardElement } from '../engine/types';
import { usePresence } from '../hooks/usePresence';
import { Icon, type IconName } from '../icons/Icon';
import { board } from '../state/board';
import { toast, ui, useUI } from '../state/ui';
import { BubbleGroup } from './Bubble';
import { ToolButton } from './controls';

type PresetId = 'bohr' | 'orbital' | 'tile';

interface Preset {
  id: PresetId;
  icon: IconName;
  title: string;
  detail: string;
}

/** Presets offered by Elements. New resources are an entry here plus a builder in engine/presets. */
const PRESETS: Preset[] = [
  { id: 'bohr', icon: 'atom', title: 'Bohr Model', detail: 'Nucleus and energy levels' },
  { id: 'orbital', icon: 'orbital', title: 'Orbital Diagram', detail: 'Boxes, arrows & energy' },
  { id: 'tile', icon: 'elementTile', title: 'Element Tile', detail: 'Periodic table square' },
];

/** Live preview: the exact elements that will be inserted, drawn as SVG. */
function Preview({ elements, appearance, label }: { elements: BoardElement[]; appearance: Appearance; label: string }) {
  const url = useMemo(() => {
    const r = unionRects(elements.map(elementBounds));
    if (!r) return '';
    const svg = elementsToSvg(elements, boardTheme(appearance), inflate(r, 8), { background: false });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [elements, appearance]);
  return url ? <img src={url} alt={label} className="fade-in max-h-[210px] max-w-full" draggable={false} /> : null;
}

/** Element picker: search by symbol, name or number, or step through the table. */
function ElementPicker({ z, onChange }: { z: number; onChange: (z: number) => void }) {
  const [q, setQ] = useState('');
  const e = elementByZ(z);
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-full bg-fill p-0.5">
        <ToolButton icon="minus" iconSize={13} label="Previous element" disabled={z <= 1} onClick={() => onChange(z - 1)} className="h-9! min-w-9!" />
        <span className="w-[112px] truncate text-center text-subhead font-semibold text-label tabular-nums" aria-live="polite">
          {e.z} · {e.symbol} <span className="font-normal text-label-2">{e.name}</span>
        </span>
        <ToolButton icon="plus" iconSize={13} label="Next element" disabled={z >= MAX_Z} onClick={() => onChange(z + 1)} className="h-9! min-w-9!" />
      </div>
      <label className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill px-2.5 text-label-2">
        <Icon name="search" size={14} />
        <input
          value={q}
          onChange={(ev) => {
            setQ(ev.target.value);
            const hit = findElement(ev.target.value);
            if (hit) onChange(hit.z);
          }}
          placeholder="Fe, iron, 26"
          aria-label="Find element"
          className="min-w-0 flex-1 bg-transparent text-subhead text-label outline-none placeholder:text-label-3"
        />
      </label>
    </div>
  );
}

/**
 * Elements: chemistry and physics resources in a few clicks. Pick a preset,
 * adjust it, and drop it on the board as ordinary editable elements.
 */
export function ElementsSheet({ appearance }: { appearance: Appearance }) {
  const open = useUI((s) => s.elementsOpen);
  const timerOpen = useUI((s) => s.timerOpen);
  const color = useUI((s) => s.pen.color);
  const { mounted, leaving } = usePresence(open);
  const [preset, setPreset] = useState<PresetId>('bohr');
  const [levels, setLevels] = useState(2);
  const [bohrMode, setBohrMode] = useState<'rings' | 'element'>('rings');
  const [z, setZ] = useState(8);
  const [orbitalStyle, setOrbitalStyle] = useState<OrbitalStyle>('energy');
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }, [open]);

  const build = (unit: number, cx = 0, cy = 0): BoardElement[] => {
    const o = { cx, cy, unit, color };
    if (preset === 'orbital') return orbitalDiagram(z, orbitalStyle, o);
    if (preset === 'tile') return elementTile(z, o);
    return bohrMode === 'element' ? bohrElement(z, o) : bohrModel(levels, o);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (open ? build(1) : []), [open, preset, levels, bohrMode, z, orbitalStyle, color]);

  const close = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheet.current?.contains(active)) active.blur();
    ui.set({ elementsOpen: false });
  };

  const insert = () => {
    const c = getController()?.worldCenter() ?? { x: 0, y: 0 };
    const els = build(1 / board.page.camera.z, c.x, c.y);
    board.addElements(els);
    // Selected together, so it can be moved or resized as one diagram.
    ui.set({ tool: 'select', selection: new Set(els.map((e) => e.id)) });
    close();
    if (preset === 'bohr' && bohrMode === 'rings') toast('Tip: add electrons with the Dot tool (D)');
  };

  if (!mounted) return null;
  const usesElement = preset !== 'bohr' || bohrMode === 'element';
  const label = preset === 'bohr' && bohrMode === 'rings' ? `Bohr model with ${levels} energy level${levels === 1 ? '' : 's'}` : `${PRESETS.find((p) => p.id === preset)!.title} of ${elementByZ(z).name}`;

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-label="Elements"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex max-h-[calc(100dvh-100px)] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto p-4 max-sm:right-3 max-sm:max-w-[calc(100vw-24px)]`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%', touchAction: 'pan-y' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) insert();
        if (e.target instanceof HTMLInputElement) return;
        const n = Number(e.key);
        if (preset === 'bohr' && bohrMode === 'rings' && n >= 1 && n <= MAX_ENERGY_LEVELS) setLevels(n);
      }}
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#34C759] text-white">
          <Icon name="atom" size={20} />
        </span>
        <h2 className="flex-1 text-headline font-semibold tracking-title">Elements</h2>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>

      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]" role="radiogroup" aria-label="Preset">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => setPreset(p.id)}
            className={`spring flex shrink-0 items-center gap-2.5 rounded-[14px] py-2 pr-4 pl-2.5 text-left ${preset === p.id ? 'bg-tint-soft' : 'bg-fill hover:bg-fill-2'}`}
          >
            <Icon name={p.icon} size={22} className={preset === p.id ? 'text-on-tint-soft' : 'text-label'} />
            <span>
              <span className={`block text-subhead leading-tight font-semibold ${preset === p.id ? 'text-on-tint-soft' : 'text-label'}`}>{p.title}</span>
              <span className={`block text-caption ${preset === p.id ? 'text-on-tint-soft' : 'text-label-2'}`}>{p.detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-h-[214px] items-center justify-center rounded-[18px] bg-bg p-3 shadow-[inset_0_0_0_0.5px_var(--hairline)]">
        <Preview elements={preview} appearance={appearance} label={label} />
      </div>

      {preset === 'bohr' && (
        <div className="mt-3">
          <BubbleGroup active={bohrMode} variant="raised" role="radiogroup" label="Bohr model" className="flex rounded-full bg-fill p-0.5">
            {(['rings', 'element'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={bohrMode === m}
                data-bubble={m}
                onClick={() => setBohrMode(m)}
                className={`spring relative flex h-9 flex-1 items-center justify-center rounded-full text-footnote font-semibold ${bohrMode === m ? 'text-label' : 'text-label-2 hover:text-label'}`}
              >
                {m === 'rings' ? 'Blank rings' : 'Element with electrons'}
              </button>
            ))}
          </BubbleGroup>
        </div>
      )}

      {preset === 'bohr' && bohrMode === 'rings' && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-subhead font-semibold text-label">Energy levels</span>
            <span className="text-footnote text-label-2">Rings around the nucleus · max {MAX_ENERGY_LEVELS}</span>
          </div>
          <BubbleGroup active={String(levels)} variant="raised" role="radiogroup" label="Energy levels" className="flex rounded-full bg-fill p-0.5">
            {Array.from({ length: MAX_ENERGY_LEVELS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={levels === n}
                aria-label={`${n} energy level${n === 1 ? '' : 's'}`}
                data-bubble={String(n)}
                onClick={() => setLevels(n)}
                className={`spring relative flex h-10 flex-1 items-center justify-center rounded-full text-subhead font-semibold tabular-nums ${levels === n ? 'text-label' : 'text-label-2 hover:text-label'}`}
              >
                {n}
              </button>
            ))}
          </BubbleGroup>
        </div>
      )}

      {usesElement && (
        <div className="mt-3">
          <ElementPicker z={z} onChange={setZ} />
          <p className="mt-1.5 px-1 text-footnote text-label-2 tabular-nums">{configurationText(z)}</p>
        </div>
      )}

      {preset === 'orbital' && (
        <div className="mt-2">
          <BubbleGroup active={orbitalStyle} variant="raised" role="radiogroup" label="Diagram style" className="flex rounded-full bg-fill p-0.5">
            {(['energy', 'row'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={orbitalStyle === s}
                data-bubble={s}
                onClick={() => setOrbitalStyle(s)}
                className={`spring relative flex h-9 flex-1 items-center justify-center rounded-full text-footnote font-semibold ${orbitalStyle === s ? 'text-label' : 'text-label-2 hover:text-label'}`}
              >
                {s === 'energy' ? 'Energy levels' : 'Row'}
              </button>
            ))}
          </BubbleGroup>
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between gap-3">
        <p className="text-footnote text-label-2 mobile:hidden">{preset === 'bohr' && bohrMode === 'rings' ? `Keys 1–${MAX_ENERGY_LEVELS} · ` : ''}⌘↩ to insert</p>
        <button
          type="button"
          onClick={insert}
          className="spring ml-auto flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-headline font-semibold text-white shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-105 active:scale-[0.97]"
        >
          Insert
        </button>
      </footer>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}
