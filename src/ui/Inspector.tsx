import type { RefObject } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { NOTE_TINTS, PALETTE, swatch, type Appearance } from '../engine/theme';
import type { ColorToken, ShapeKind } from '../engine/types';
import { ui, useUI, type UIState } from '../state/ui';
import { BubbleGroup } from './Bubble';
import { Toggle } from './controls';
import { Popover } from './Popover';

export const SHAPES: { kind: ShapeKind; icon: IconName; label: string; key?: string }[] = [
  { kind: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
  { kind: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'O' },
  { kind: 'triangle', icon: 'triangle', label: 'Triangle' },
  { kind: 'line', icon: 'line', label: 'Line' },
  { kind: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A' },
  { kind: 'polygon', icon: 'polygon', label: 'Polygon — tap each corner, tap the first to close', key: 'G' },
  { kind: 'callout', icon: 'callout', label: 'Callout', key: 'B' },
];

export const SIZES: Record<'pen' | 'highlighter' | 'shape' | 'text' | 'dot', { min: number; max: number; presets: number[] }> = {
  pen: { min: 1, max: 24, presets: [2, 4, 8] },
  highlighter: { min: 8, max: 48, presets: [14, 22, 34] },
  shape: { min: 1, max: 16, presets: [2, 4, 7] },
  text: { min: 12, max: 96, presets: [20, 28, 44] },
  dot: { min: 4, max: 40, presets: [8, 12, 20] },
};

export const COLOR_NAMES: Record<string, string> = {
  label: 'Black', blue: 'Blue', red: 'Red', green: 'Green', orange: 'Orange', yellow: 'Yellow', purple: 'Purple', pink: 'Pink',
};

type StyledTool = 'pen' | 'highlighter' | 'shape' | 'text' | 'dot';

function styledTool(s: UIState): StyledTool {
  if (s.tool === 'highlighter' || s.tool === 'shape' || s.tool === 'text' || s.tool === 'dot') return s.tool;
  return 'pen';
}

function Swatches({ value, colors, onPick, appearance }: { value: ColorToken; colors: ColorToken[]; onPick: (c: ColorToken) => void; appearance: Appearance }) {
  return (
    <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Color">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_NAMES[c] ?? c}
          title={COLOR_NAMES[c] ?? c}
          onClick={() => onPick(c)}
          className="spring flex h-11 w-11 items-center justify-center rounded-full active:scale-90"
        >
          <span
            className={`spring block rounded-full ${value === c ? 'h-8 w-8 shadow-[0_0_0_2.5px_var(--bg),0_0_0_4.5px_var(--tint)]' : 'h-7 w-7 shadow-[0_0_0_1px_var(--hairline)]'}`}
            style={{ background: swatch(c, appearance) }}
          />
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <span className="text-subhead text-label">{label}</span>
      {children}
    </div>
  );
}

/** Tool options sheet: color, weight and tool-specific toggles. */
export function Inspector({ open, onClose, anchor, appearance }: { open: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null>; appearance: Appearance }) {
  const s = useUI((x) => x);
  const tool = s.tool;

  if (tool === 'eraser') {
    return (
      <Popover open={open} onClose={onClose} anchor={anchor} label="Eraser options" className="w-[300px] p-4">
        <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Eraser</p>
        <Row label="Size">
          <input
            type="range"
            className="slider w-40"
            min={6}
            max={80}
            value={s.eraserSize}
            onChange={(e) => ui.set({ eraserSize: +e.target.value })}
            aria-label="Eraser size"
          />
        </Row>
        <Row label="Partial erase">
          <Toggle checked={s.eraserMode === 'segment'} onChange={(v) => ui.set({ eraserMode: v ? 'segment' : 'object' })} label="Partial erase" />
        </Row>
        <p className="mt-1 text-footnote text-label-2">
          {s.eraserMode === 'segment' ? 'Erases only the part of a stroke you touch; shapes and text go whole.' : 'Erases whole strokes and objects it touches.'} Locked items are never erased. Undo with ⌘Z.
        </p>
      </Popover>
    );
  }

  if (tool === 'note') {
    return (
      <Popover open={open} onClose={onClose} anchor={anchor} label="Sticky note color" className="p-3">
        <p className="mb-1 px-1 text-footnote font-semibold tracking-wide text-label-2 uppercase">Note color</p>
        <div className="flex gap-1">
          {NOTE_TINTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_NAMES[c] ?? c}
              onClick={() => ui.set({ noteTint: c })}
              className="spring flex h-11 w-11 items-center justify-center rounded-xl active:scale-90"
            >
              <span
                className={`block h-8 w-8 rounded-lg ${s.noteTint === c ? 'shadow-[0_0_0_2.5px_var(--bg),0_0_0_4.5px_var(--tint)]' : 'shadow-[0_0_0_1px_var(--hairline)]'}`}
                style={{ background: swatch(c, appearance) }}
              />
            </button>
          ))}
        </div>
      </Popover>
    );
  }

  const key = styledTool(s);
  const style = s[key];
  const sizes = SIZES[key];
  const setStyle = (patch: Partial<UIState[typeof key]>) => ui.set({ [key]: { ...style, ...patch } } as Partial<UIState>);

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label="Tool options" className="w-[392px] max-w-[calc(100vw-24px)] p-4">
      {key === 'shape' && (
        <BubbleGroup active={s.shapeKind} variant="raised" role="radiogroup" label="Shape" className="mb-3 flex justify-between rounded-full bg-fill p-0.5">
          {SHAPES.map((sh) => (
            <button
              key={sh.kind}
              type="button"
              role="radio"
              aria-checked={s.shapeKind === sh.kind}
              aria-label={sh.label}
              title={sh.key ? `${sh.label} (${sh.key})` : sh.label}
              data-bubble={sh.kind}
              onClick={() => ui.set({ shapeKind: sh.kind, tool: 'shape' })}
              className={`spring relative flex h-10 flex-1 items-center justify-center rounded-full ${s.shapeKind === sh.kind ? 'text-tint' : 'text-label-2'}`}
            >
              <Icon name={sh.icon} size={18} />
            </button>
          ))}
        </BubbleGroup>
      )}

      <Swatches value={style.color} colors={PALETTE} onPick={(c) => setStyle({ color: c })} appearance={appearance} />

      <div className="mt-3 flex items-center gap-3">
        <div className="flex gap-1">
          {sizes.presets.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`Size ${p}`}
              onClick={() => setStyle({ size: p })}
              className={`spring flex h-11 w-11 items-center justify-center rounded-full ${style.size === p ? 'bg-tint-soft' : 'hover:bg-fill'}`}
            >
              {key === 'text' ? (
                <span className="font-semibold text-label" style={{ fontSize: 10 + sizes.presets.indexOf(p) * 5 }}>Aa</span>
              ) : (
                <span
                  className="block rounded-full"
                  style={{
                    width: Math.max(4, Math.min(26, p * (key === 'highlighter' ? 0.75 : key === 'dot' ? 1 : 2.2))),
                    height: Math.max(4, Math.min(26, p * (key === 'highlighter' ? 0.75 : key === 'dot' ? 1 : 2.2))),
                    background: swatch(style.color, appearance),
                    opacity: key === 'highlighter' ? 0.5 : 1,
                  }}
                />
              )}
            </button>
          ))}
        </div>
        <input
          type="range"
          className="slider flex-1"
          min={sizes.min}
          max={sizes.max}
          value={style.size}
          onChange={(e) => setStyle({ size: +e.target.value })}
          aria-label="Size"
        />
        <span className="w-7 text-right text-footnote text-label-2 tabular-nums">{style.size}</span>
      </div>

      {key === 'pen' && (
        <div className="mt-2 border-t border-hairline pt-2">
          <Row label="Smoothing">
            <input
              type="range"
              className="slider w-40"
              min={0}
              max={100}
              value={Math.round(s.penSmoothing * 100)}
              onChange={(e) => ui.set({ penSmoothing: +e.target.value / 100 })}
              aria-label="Pen smoothing"
            />
          </Row>
          <Row label="Pressure sensitivity">
            <Toggle checked={s.penPressure} onChange={(v) => ui.set({ penPressure: v })} label="Pressure sensitivity" />
          </Row>
          <p className="text-footnote text-label-2">Pencil pressure shapes the line; off draws a constant width.</p>
        </div>
      )}
      {(key === 'pen' || key === 'highlighter') && (
        <div className="mt-2 border-t border-hairline pt-2">
          <Row label="Hold to snap shapes">
            <Toggle checked={s.snapShapes} onChange={(v) => ui.set({ snapShapes: v })} label="Hold to snap shapes" />
          </Row>
          <p className="text-footnote text-label-2">Draw a line, circle or polygon and pause — it snaps to a clean shape.</p>
        </div>
      )}
      {key === 'dot' && (
        <div className="mt-2 border-t border-hairline pt-2">
          <Row label="Snap to rings">
            <Toggle checked={s.snapDots} onChange={(v) => ui.set({ snapDots: v })} label="Snap dots to rings" />
          </Row>
          <p className="text-footnote text-label-2">Tap near a circle, such as a Bohr model orbit, and the dot lands right on it.</p>
        </div>
      )}
      {key === 'shape' && (
        <div className="mt-2 border-t border-hairline pt-2">
          <Row label="Fill">
            <Toggle checked={s.shape.fill} onChange={(v) => setStyle({ fill: v } as never)} label="Fill shapes" />
          </Row>
          <p className="text-footnote text-label-2">
            {s.shapeKind === 'polygon' ? 'Tap each corner; tap the first corner (or press Return) to close it.' : 'Hold ⇧ Shift for squares, circles and 45° lines.'}
          </p>
        </div>
      )}
    </Popover>
  );
}
