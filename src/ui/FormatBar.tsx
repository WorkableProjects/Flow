import { useRef, useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { FONT_NAMES, FONT_STACKS, type BoolMark } from '../engine/richtext';
import { PALETTE, swatch, type Appearance } from '../engine/theme';
import type { ColorToken, FontFamily, TextAlign } from '../engine/types';
import { BubbleGroup } from './Bubble';
import { Divider, ToolButton } from './controls';
import { Popover } from './Popover';

export interface FormatSpec {
  mark: BoolMark;
  icon: IconName;
  label: string;
  shortcut: string;
}

/**
 * Character formats. The first four sit on the bar; code and highlight
 * live in the Aa sheet with the paragraph options.
 */
export const FORMATS: FormatSpec[] = [
  { mark: 'bold', icon: 'bold', label: 'Bold', shortcut: '⌘B' },
  { mark: 'italic', icon: 'italic', label: 'Italic', shortcut: '⌘I' },
  { mark: 'underline', icon: 'underline', label: 'Underline', shortcut: '⌘U' },
  { mark: 'strike', icon: 'strike', label: 'Strikethrough', shortcut: '⇧⌘X' },
  { mark: 'code', icon: 'code', label: 'Code', shortcut: '⌘E' },
  { mark: 'highlight', icon: 'highlighter', label: 'Highlight', shortcut: '⇧⌘H' },
];

export const PRIMARY_FORMATS = FORMATS.slice(0, 4);

/** Key (with ⌘/Ctrl) → format, for the editor's keyboard shortcuts. */
export const FORMAT_KEYS: Record<string, { mark: BoolMark; shift: boolean }> = {
  b: { mark: 'bold', shift: false },
  i: { mark: 'italic', shift: false },
  u: { mark: 'underline', shift: false },
  x: { mark: 'strike', shift: true },
  e: { mark: 'code', shift: false },
  h: { mark: 'highlight', shift: true },
};

export type MarkState = Partial<Record<BoolMark, boolean>> & { link?: string; color?: ColorToken; list?: 'bullet' | 'number' };

export interface TextStyleState {
  font: FontFamily;
  fontSize: number;
  align: TextAlign;
  /** Sticky notes wrap, so they can justify. */
  wraps: boolean;
}

export const ALIGNS: { value: TextAlign; icon: IconName; label: string; shortcut: string }[] = [
  { value: 'left', icon: 'alignLeft', label: 'Align left', shortcut: '⇧⌘L' },
  { value: 'center', icon: 'alignCenter', label: 'Center', shortcut: '⇧⌘E' },
  { value: 'right', icon: 'alignRight', label: 'Align right', shortcut: '⇧⌘R' },
  { value: 'justify', icon: 'alignJustify', label: 'Justify', shortcut: '⇧⌘J' },
];

/** Font sizes offered by the stepper (board px at 100%). */
export const FONT_SIZES = [12, 14, 16, 20, 24, 28, 36, 44, 56, 72, 96];

export const stepSize = (size: number, dir: 1 | -1) => {
  if (dir > 0) return FONT_SIZES.find((s) => s > size + 0.5) ?? FONT_SIZES[FONT_SIZES.length - 1];
  return [...FONT_SIZES].reverse().find((s) => s < size - 0.5) ?? FONT_SIZES[0];
};

/** Keep focus (and the text selection) in the editor when pressing a format button. */
export const keepFocus = (e: React.PointerEvent | React.MouseEvent) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
};

export function FormatButtons({ state, onToggle, tabIndex, formats = PRIMARY_FORMATS }: { state: MarkState; onToggle: (f: FormatSpec) => void; tabIndex?: number; formats?: FormatSpec[] }) {
  return (
    <>
      {formats.map((f) => (
        <ToolButton
          key={f.mark}
          icon={f.icon}
          iconSize={17}
          label={f.label}
          shortcut={f.shortcut}
          active={!!state[f.mark]}
          tabIndex={tabIndex}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={() => onToggle(f)}
        />
      ))}
    </>
  );
}

/** Color well that opens a palette; the current color is the well itself. */
export function ColorButton({ value, onPick, appearance, tabIndex, label = 'Text color' }: { value: ColorToken; onPick: (c: ColorToken) => void; appearance: Appearance; tabIndex?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        tabIndex={tabIndex}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={() => setOpen((v) => !v)}
        className="spring flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-fill active:scale-[0.92]"
      >
        <span className="block h-6 w-6 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9),0_0_0_1px_var(--hairline)]" style={{ background: swatch(value, appearance) }} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top" label={label} className="p-2" chrome>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={label}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              aria-label={COLOR_LABELS[c] ?? c}
              title={COLOR_LABELS[c] ?? c}
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="spring flex h-11 w-11 items-center justify-center rounded-full active:scale-90"
            >
              <span
                className={`block rounded-full ${value === c ? 'h-8 w-8 shadow-[0_0_0_2.5px_var(--bg),0_0_0_4.5px_var(--tint)]' : 'h-7 w-7 shadow-[0_0_0_1px_var(--hairline)]'}`}
                style={{ background: swatch(c, appearance) }}
              />
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

const COLOR_LABELS: Record<string, string> = {
  label: 'Black', blue: 'Blue', red: 'Red', green: 'Green', orange: 'Orange', yellow: 'Yellow', purple: 'Purple', pink: 'Pink',
};

/**
 * The Aa sheet: font, size, alignment, lists and the less common character
 * formats — the Apple Notes pattern of a compact bar plus one format sheet.
 */
export function TextStyleButton({
  style,
  marks,
  onStyle,
  onToggle,
  onList,
  tabIndex,
}: {
  style: TextStyleState;
  marks: MarkState;
  onStyle: (patch: Partial<Omit<TextStyleState, 'wraps'>>) => void;
  onToggle: (f: FormatSpec) => void;
  onList: (list: 'bullet' | 'number') => void;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const aligns = style.wraps ? ALIGNS : ALIGNS.slice(0, 3);
  return (
    <>
      <ToolButton ref={ref} icon="textSize" iconSize={19} label="Text style" active={open} tabIndex={tabIndex} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => setOpen((v) => !v)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top" label="Text style" className="w-[320px] max-w-[calc(100vw-24px)] p-3" chrome>
        <BubbleGroup active={style.font} variant="raised" role="radiogroup" label="Font" className="flex rounded-full bg-fill p-0.5">
          {(Object.keys(FONT_NAMES) as FontFamily[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={style.font === f}
              data-bubble={f}
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => onStyle({ font: f })}
              className={`spring relative flex h-9 flex-1 items-center justify-center rounded-full text-footnote font-semibold ${style.font === f ? 'text-label' : 'text-label-2 hover:text-label'}`}
              style={{ fontFamily: FONT_STACKS[f] }}
            >
              {FONT_NAMES[f]}
            </button>
          ))}
        </BubbleGroup>

        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-subhead text-label">Size</span>
          <div className="flex items-center rounded-full bg-fill p-0.5">
            <ToolButton icon="minus" iconSize={13} label="Smaller" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onStyle({ fontSize: stepSize(style.fontSize, -1) })} className="h-9! min-w-9!" />
            <span className="w-10 text-center text-subhead font-semibold text-label tabular-nums" aria-live="polite">{Math.round(style.fontSize)}</span>
            <ToolButton icon="plus" iconSize={13} label="Larger" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onStyle({ fontSize: stepSize(style.fontSize, 1) })} className="h-9! min-w-9!" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1">
          <BubbleGroup active={style.align} variant="raised" role="radiogroup" label="Alignment" className="flex flex-1 rounded-full bg-fill p-0.5">
            {aligns.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={style.align === a.value}
                aria-label={a.label}
                title={`${a.label} (${a.shortcut})`}
                data-bubble={a.value}
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={() => onStyle({ align: a.value })}
                className={`spring relative flex h-9 flex-1 items-center justify-center rounded-full ${style.align === a.value ? 'text-label' : 'text-label-2 hover:text-label'}`}
              >
                <Icon name={a.icon} size={16} />
              </button>
            ))}
          </BubbleGroup>
        </div>

        <div className="mt-3 flex items-center gap-0.5 rounded-[14px] bg-fill p-0.5">
          <ToolButton icon="listBullet" iconSize={17} label="Bulleted list" shortcut="⇧⌘8" active={marks.list === 'bullet'} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onList('bullet')} className="flex-1" />
          <ToolButton icon="listNumber" iconSize={17} label="Numbered list" shortcut="⇧⌘7" active={marks.list === 'number'} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onList('number')} className="flex-1" />
          <Divider />
          {FORMATS.slice(3).map((f) => (
            <ToolButton key={f.mark} icon={f.icon} iconSize={17} label={f.label} shortcut={f.shortcut} active={!!marks[f.mark]} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onToggle(f)} className="flex-1" />
          ))}
        </div>
      </Popover>
    </>
  );
}

/** Link button: an inline field for the URL; with a link under the selection, it removes it. */
export function LinkButton({ current, onLink, onCancel, tabIndex, onOpenChange }: { current?: string; onLink: (url: string | null) => void; onCancel?: () => void; tabIndex?: number; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false);
  const [url, setUrl] = useState('');
  const ref = useRef<HTMLButtonElement>(null);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const submit = () => {
    setOpen(false);
    if (url.trim()) onLink(url.trim());
    else onCancel?.();
  };
  return (
    <>
      <ToolButton
        ref={ref}
        icon="link"
        iconSize={17}
        label={current ? 'Remove link' : 'Add link'}
        shortcut="⌘K"
        active={!!current || open}
        tabIndex={tabIndex}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={() => {
          if (current) onLink(null);
          else {
            setUrl('');
            setOpen(!open);
          }
        }}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top" label="Link" className="w-[300px] max-w-[calc(100vw-24px)] p-2" chrome>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                onCancel?.();
              }
            }}
            placeholder="example.com"
            aria-label="Link address"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            className="h-10 min-w-0 flex-1 rounded-[10px] bg-fill px-3 text-body text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--tint)]"
          />
          <button type="submit" className="spring h-10 rounded-full bg-tint px-4 text-subhead font-semibold text-white active:scale-[0.96]">
            Add
          </button>
        </form>
      </Popover>
    </>
  );
}
