import { useRef, useState } from 'react';
import type { IconName } from '../icons/Icon';
import { Icon } from '../icons/Icon';
import { NOTE_TINTS, PALETTE, swatch, type Appearance } from '../engine/theme';
import type { ColorToken, Tool } from '../engine/types';
import { clearPage, pickImage } from '../state/actions';
import { setTool, ui, useUI, type DockTool, type UIState } from '../state/ui';
import { BubbleGroup } from './Bubble';
import { Divider, ToolButton } from './controls';
import { Glass } from './Glass';
import { COLOR_NAMES, Inspector, SHAPES, SIZES } from './Inspector';

/** Every tool the dock can show; the user picks which, and in what order (Settings › Customize Toolbar). */
export const TOOL_CATALOG: { tool: DockTool; icon: IconName; label: string; key: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select', key: 'V' },
  { tool: 'hand', icon: 'hand', label: 'Pan', key: 'H' },
  { tool: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
  { tool: 'highlighter', icon: 'highlighter', label: 'Highlighter', key: 'M' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { tool: 'laser', icon: 'laser', label: 'Laser pointer', key: 'L' },
  { tool: 'shape', icon: 'shapes', label: 'Shapes', key: 'S' },
  { tool: 'dot', icon: 'dot', label: 'Dot', key: 'D' },
  { tool: 'text', icon: 'text', label: 'Text', key: 'T' },
  { tool: 'image', icon: 'image', label: 'Insert image', key: 'I' },
];
const TOOLS = TOOL_CATALOG.filter((t) => t.tool !== 'image') as { tool: Tool; icon: IconName; label: string; key: string }[];
const NAV = new Set<DockTool>(['select', 'hand']);

/** Keyboard-only tools (share a dock button with another tool). */
const EXTRA_KEYS: { tool: Tool; key: string }[] = [{ tool: 'note', key: 'N' }];

/** Text and sticky notes are one dock tool with two kinds. */
const dockKey = (t: Tool) => (t === 'note' ? 'text' : t);

/** The color the well shows for the current tool. */
function currentColor(s: UIState): string | null {
  switch (s.tool) {
    case 'pen':
    case 'select':
    case 'hand':
      return s.pen.color;
    case 'highlighter':
      return s.highlighter.color;
    case 'shape':
      return s.shape.color;
    case 'text':
      return s.text.color;
    case 'note':
      return s.noteTint;
    case 'dot':
      return s.dot.color;
    default:
      return null;
  }
}

/** Primary floating tool palette — bottom centre, Liquid Glass. */
export function ToolDock({ appearance }: { appearance: Appearance }) {
  const tool = useUI((s) => s.tool);
  const shapeKind = useUI((s) => s.shapeKind);
  const textKind = useUI((s) => s.textKind);
  const color = useUI(currentColor);
  const dockTools = useUI((s) => s.dockTools);
  const shown = dockTools.map((t) => TOOL_CATALOG.find((c) => c.tool === t)!).filter(Boolean);
  const nav = shown.filter((t) => NAV.has(t.tool));
  const rest = shown.filter((t) => !NAV.has(t.tool));
  const [inspector, setInspector] = useState(false);
  const wellRef = useRef<HTMLButtonElement>(null);

  const choose = (t: Tool) => {
    const current = dockKey(tool);
    // Tapping the active drawing tool opens its options (Apple Notes pattern).
    if (t === current && t !== 'select' && t !== 'hand' && t !== 'laser') setInspector((v) => !v);
    else {
      setTool(t === 'text' ? textKind : t);
      setInspector(false);
    }
  };

  const shapeIcon = SHAPES.find((s) => s.kind === shapeKind)?.icon ?? 'shapes';
  const iconFor = (t: Tool, icon: IconName): IconName => (t === 'shape' ? shapeIcon : t === 'text' && textKind === 'note' ? 'note' : icon);

  return (
    <>
      <ToolShelf appearance={appearance} onMore={() => setInspector(true)} />
      <Glass
        radius={30}
        className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2"
        role="toolbar"
        aria-label="Tools"
      >
        <BubbleGroup active={dockKey(tool)} className="flex items-center gap-0.5 overflow-x-auto p-1.5 [scrollbar-width:none]">
          {nav.map((t) => (
            <ToolButton key={t.tool} data-bubble={t.tool} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.tool} onClick={() => choose(t.tool as Tool)} />
          ))}
          {nav.length > 0 && rest.length > 0 && <Divider />}
          {rest.map((t) =>
            t.tool === 'image' ? (
              <ToolButton key="image" icon="image" label="Insert image" shortcut="I" onClick={pickImage} />
            ) : (
              <ToolButton
                key={t.tool}
                data-bubble={t.tool}
                icon={iconFor(t.tool as Tool, t.icon)}
                label={t.tool === 'text' ? 'Text & sticky notes' : t.label}
                shortcut={t.tool === 'text' ? 'T · N' : t.key}
                active={dockKey(tool) === t.tool}
                onClick={() => choose(t.tool as Tool)}
              />
            ),
          )}
          <Divider />
          <button
            ref={wellRef}
            type="button"
            aria-label="Color and size"
            title="Color and size"
            onClick={() => setInspector((v) => !v)}
            className="spring relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-fill active:scale-[0.92]"
          >
            {color ? (
              <span
                className="block h-7 w-7 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9),0_0_0_1px_var(--hairline)] transition-[background-color] duration-300"
                style={{ background: swatch(color, appearance) }}
              />
            ) : (
              <Icon name="more" size={22} />
            )}
          </button>
        </BubbleGroup>
        <Inspector open={inspector} onClose={() => setInspector(false)} anchor={wellRef} appearance={appearance} />
      </Glass>
    </>
  );
}

// ─── Contextual shelf ────────────────────────────────────────────────

const QUICK_COLORS: ColorToken[] = PALETTE.slice(0, 6);

function Swatch({ color, appearance, square }: { color: ColorToken; appearance: Appearance; square?: boolean }) {
  return (
    <span
      aria-hidden
      className={`block h-6 w-6 shadow-[0_0_0_1px_var(--hairline)] ${square ? 'rounded-[7px]' : 'rounded-full'}`}
      style={{ background: swatch(color, appearance) }}
    />
  );
}

function SwatchRow({ colors, value, onPick, appearance, square }: { colors: ColorToken[]; value: ColorToken; onPick: (c: ColorToken) => void; appearance: Appearance; square?: boolean }) {
  return (
    <BubbleGroup active={colors.includes(value) ? value : null} variant="ring" role="radiogroup" label="Color" className="flex items-center">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_NAMES[c] ?? c}
          title={COLOR_NAMES[c] ?? c}
          data-bubble={c}
          onClick={() => onPick(c)}
          className={`spring relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-90 ${i >= 4 ? 'max-sm:hidden' : ''}`}
        >
          <Swatch color={c} appearance={appearance} square={square} />
        </button>
      ))}
    </BubbleGroup>
  );
}

function SizeRow({ presets, value, onPick, dot }: { presets: number[]; value: number; onPick: (n: number) => void; dot: (n: number, i: number) => number }) {
  return (
    <BubbleGroup active={presets.includes(value) ? String(value) : null} variant="soft" role="radiogroup" label="Size" className="flex items-center">
      {presets.map((p, i) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={`Size ${p}`}
          data-bubble={String(p)}
          onClick={() => onPick(p)}
          className="spring relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-90"
        >
          <span className="block rounded-full bg-label" style={{ width: dot(p, i), height: dot(p, i) }} />
        </button>
      ))}
    </BubbleGroup>
  );
}

/**
 * Quick options for the active tool, just above the dock. Its layout
 * follows the tool category — colors and weights for ink, kinds for
 * shapes, text vs. sticky for text — and it steps aside for tools that
 * have no options (select, pan, laser).
 */
function ToolShelf({ appearance, onMore }: { appearance: Appearance; onMore: () => void }) {
  const s = useUI((x) => x);
  const tool = s.tool;
  const kind: 'ink' | 'shape' | 'text' | 'eraser' | 'dot' | null =
    tool === 'dot' ? 'dot' : tool === 'pen' || tool === 'highlighter' ? 'ink' : tool === 'shape' ? 'shape' : tool === 'text' || tool === 'note' ? 'text' : tool === 'eraser' ? 'eraser' : null;
  // Keep the last layout while it animates out.
  const shown = useRef(kind);
  if (kind) shown.current = kind;
  const layout = kind ?? shown.current;
  const visible = kind !== null;

  let body: React.ReactNode = null;
  if (layout === 'ink') {
    const key = tool === 'highlighter' ? 'highlighter' : 'pen';
    const st = s[key];
    body = (
      <>
        <SwatchRow colors={QUICK_COLORS} value={st.color} onPick={(c) => ui.set({ [key]: { ...st, color: c } } as Partial<UIState>)} appearance={appearance} />
        <Divider />
        <SizeRow presets={SIZES[key].presets} value={st.size} onPick={(n) => ui.set({ [key]: { ...st, size: n } } as Partial<UIState>)} dot={(_n, i) => (key === 'highlighter' ? 8 + i * 5 : 4 + i * 4)} />
      </>
    );
  } else if (layout === 'dot') {
    body = (
      <>
        <SwatchRow colors={QUICK_COLORS} value={s.dot.color} onPick={(c) => ui.set({ dot: { ...s.dot, color: c } })} appearance={appearance} />
        <Divider />
        <SizeRow presets={SIZES.dot.presets} value={s.dot.size} onPick={(n) => ui.set({ dot: { ...s.dot, size: n } })} dot={(n) => n} />
        <Divider />
        <button
          type="button"
          role="switch"
          aria-checked={s.snapDots}
          title="Snap dots onto circles (Bohr model orbits)"
          onClick={() => ui.set({ snapDots: !s.snapDots })}
          className={`spring flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold ${s.snapDots ? 'bg-tint-soft text-on-tint-soft' : 'text-label-2 hover:bg-fill'}`}
        >
          <Icon name="atom" size={16} /> Snap
        </button>
      </>
    );
  } else if (layout === 'shape') {
    body = (
      <>
        <BubbleGroup active={s.shapeKind} variant="soft" role="radiogroup" label="Shape" className="flex items-center">
          {SHAPES.map((sh) => (
            <button
              key={sh.kind}
              type="button"
              role="radio"
              aria-checked={s.shapeKind === sh.kind}
              aria-label={sh.label}
              title={sh.key ? `${sh.label} (${sh.key})` : sh.label}
              data-bubble={sh.kind}
              onClick={() => ui.set({ shapeKind: sh.kind })}
              className={`spring relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-90 ${s.shapeKind === sh.kind ? 'text-on-tint-soft' : 'text-label'}`}
            >
              <Icon name={sh.icon} size={18} />
            </button>
          ))}
        </BubbleGroup>
        <Divider />
        <SwatchRow colors={QUICK_COLORS.slice(0, 4)} value={s.shape.color} onPick={(c) => ui.set({ shape: { ...s.shape, color: c } })} appearance={appearance} />
      </>
    );
  } else if (layout === 'text') {
    const note = tool === 'note';
    body = (
      <>
        <BubbleGroup active={tool} variant="raised" role="radiogroup" label="Text kind" className="mx-1 flex items-center rounded-full bg-fill p-0.5">
          {(['text', 'note'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={tool === k}
              data-bubble={k}
              onClick={() => setTool(k)}
              className={`spring relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold ${tool === k ? 'text-label' : 'text-label-2'}`}
            >
              <Icon name={k === 'text' ? 'text' : 'note'} size={15} />
              {k === 'text' ? 'Text' : 'Sticky'}
            </button>
          ))}
        </BubbleGroup>
        <Divider />
        {note ? (
          <SwatchRow colors={NOTE_TINTS.slice(0, 5)} value={s.noteTint} onPick={(c) => ui.set({ noteTint: c })} appearance={appearance} square />
        ) : (
          <SwatchRow colors={QUICK_COLORS.slice(0, 5)} value={s.text.color} onPick={(c) => ui.set({ text: { ...s.text, color: c } })} appearance={appearance} />
        )}
      </>
    );
  } else if (layout === 'eraser') {
    body = (
      <>
        <BubbleGroup active={s.eraserMode} variant="raised" role="radiogroup" label="Eraser mode" className="mx-1 flex items-center rounded-full bg-fill p-0.5">
          {(['object', 'segment'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={s.eraserMode === m}
              data-bubble={m}
              title={m === 'object' ? 'Erase whole strokes and objects' : 'Erase only the part of a stroke you touch'}
              onClick={() => ui.set({ eraserMode: m })}
              className={`spring relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold ${s.eraserMode === m ? 'text-label' : 'text-label-2'}`}
            >
              <Icon name={m === 'object' ? 'eraser' : 'eraseSegment'} size={15} />
              {m === 'object' ? 'Object' : 'Partial'}
            </button>
          ))}
        </BubbleGroup>
        <Divider />
        <SizeRow presets={[10, 16, 32]} value={s.eraserSize} onPick={(n) => ui.set({ eraserSize: n })} dot={(_n, i) => 6 + i * 5} />
        <Divider />
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Clear everything on this page? You can undo this.')) clearPage();
          }}
          className="spring flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-danger hover:bg-fill"
        >
          <Icon name="trash" size={15} /> Clear
        </button>
      </>
    );
  }

  return (
    <Glass
      radius={26}
      aria-hidden={!visible}
      className={`spring absolute bottom-[calc(max(16px,env(safe-area-inset-bottom))+72px)] left-1/2 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2 [@media(max-height:520px)]:hidden ${visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      role="toolbar"
      aria-label="Tool options"
    >
      <div key={layout ?? 'none'} className="fade-in flex items-center gap-0.5 p-1" inert={!visible}>
        {body}
        {layout !== 'eraser' && layout !== null && (
          <>
            <Divider />
            <ToolButton icon="more" label="More options" iconSize={19} onClick={onMore} />
          </>
        )}
      </div>
    </Glass>
  );
}

export const selectToolByKey = (key: string): boolean => {
  const all = [...TOOLS, ...EXTRA_KEYS];
  const hit = all.find((t) => t.key.toLowerCase() === key.toLowerCase());
  if (hit) {
    setTool(hit.tool);
    return true;
  }
  const shape = SHAPES.find((s) => s.key?.toLowerCase() === key.toLowerCase());
  if (shape) {
    ui.set({ tool: 'shape', shapeKind: shape.kind, selection: new Set() });
    return true;
  }
  return false;
};
