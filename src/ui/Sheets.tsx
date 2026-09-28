import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../hooks/usePresence';
import { Icon } from '../icons/Icon';
import { DOCK_TOOLS, ui, useUI, type DockTool } from '../state/ui';
import { ToolButton, Toggle } from './controls';
import { TOOL_CATALOG } from './ToolDock';

/** A centred modal sheet (Settings-style), with Escape to close and focus kept inside. */
function Sheet({ open, onClose, title, icon, children, width = 460 }: { open: boolean; onClose: () => void; title: string; icon: Parameters<typeof Icon>[0]['name']; children: ReactNode; width?: number }) {
  const { mounted, leaving } = usePresence(open);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('button, input')?.focus());
    return () => prev?.focus?.();
  }, [open]);
  if (!mounted) return null;
  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${leaving ? 'pointer-events-none' : ''}`}>
      <div className={`absolute inset-0 bg-black/20 ${leaving ? 'opacity-0' : 'fade-in'} transition-opacity`} onPointerDown={onClose} aria-hidden />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet ${leaving ? 'pop-out' : 'pop-in'} relative flex max-h-[calc(100dvh-32px)] w-full flex-col overflow-hidden rounded-[26px]!`}
        style={{ maxWidth: width, ['--origin' as string]: '50% 50%' }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
      >
        <header className="flex items-center gap-3 px-4 pt-4 pb-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-tint text-white">
            <Icon name={icon} size={19} />
          </span>
          <h2 className="flex-1 text-headline font-semibold tracking-title">{title}</h2>
          <ToolButton icon="close" label="Close" iconSize={12} onClick={onClose} />
        </header>
        <div className="overflow-y-auto px-4 pb-4" style={{ touchAction: 'pan-y' }}>{children}</div>
      </section>
    </div>,
    document.getElementById('overlay') ?? document.body,
  );
}

const SHORTCUTS: [string, [string, string][]][] = [
  ['Tools', [
    ['V · H', 'Select · Pan'],
    ['P · M · E · L', 'Pen · Highlighter · Eraser · Laser'],
    ['S · R · O · A', 'Shapes · Rectangle · Ellipse · Arrow'],
    ['G · B', 'Polygon · Callout'],
    ['D', 'Dot (snaps to rings)'],
    ['T · N · I', 'Text · Sticky note · Image'],
    ['Return · Esc', 'Finish · cancel a polygon'],
  ]],
  ['Text', [
    ['⌘B · ⌘I · ⌘U', 'Bold · Italic · Underline'],
    ['⇧⌘X · ⌘E · ⇧⌘H', 'Strikethrough · Code · Highlight'],
    ['⌘K', 'Add or remove a link'],
    ['⇧⌘8 · ⇧⌘7', 'Bulleted · Numbered list'],
    ['⇧⌘L · E · R · J', 'Align left · center · right · justify'],
    ['⌘+ · ⌘−', 'Larger · Smaller'],
    ['⌘-click', 'Open a link on the board'],
  ]],
  ['Objects', [
    ['⌘A · ⌘D · ⌫', 'Select all · Duplicate · Delete'],
    ['⌘G · ⇧⌘G', 'Group · Ungroup'],
    ['] · [', 'Bring forward · Send backward'],
    ['⇧] · ⇧[', 'Bring to front · Send to back'],
    ['Arrows · ⇧Arrows', 'Nudge 1 pt · 10 pt'],
    ["⌘'", 'Snap to grid'],
    ['Double-click', 'Edit text or equation · select inside a group'],
  ]],
  ['Board', [
    ['⌘Z · ⇧⌘Z', 'Undo · Redo'],
    ['Space + drag', 'Pan'],
    ['⌘ + scroll / pinch', 'Zoom'],
    ['⌘0 · ⌘1', 'Actual size · Zoom to fit'],
    ['PgUp · PgDn · ⌥P', 'Previous · Next page · Pages'],
    ['C', 'Screen Hider'],
    ['⌘S · ⌘O', 'Save · Open lesson'],
    ['?', 'This list'],
  ]],
];

export function ShortcutsSheet() {
  const open = useUI((s) => s.shortcutsOpen);
  return (
    <Sheet open={open} onClose={() => ui.set({ shortcutsOpen: false })} title="Keyboard Shortcuts" icon="keyboard" width={560}>
      <div className="grid gap-4 sm:grid-cols-2">
        {SHORTCUTS.map(([group, rows]) => (
          <section key={group} aria-label={group}>
            <h3 className="mb-1.5 text-footnote font-semibold tracking-wide text-label-2 uppercase">{group}</h3>
            <dl className="overflow-hidden rounded-[14px] bg-cell shadow-[0_0_0_0.5px_var(--hairline)]">
              {rows.map(([k, v]) => (
                <div key={k} className="flex min-h-10 items-center justify-between gap-3 border-b border-hairline px-3 py-1.5 last:border-0">
                  <dd className="text-footnote text-label">{v}</dd>
                  <dt className="shrink-0 text-footnote font-semibold text-label-2 tabular-nums">{k}</dt>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/** Choose which tools the dock shows, and in what order. */
export function CustomizeSheet() {
  const open = useUI((s) => s.customizeOpen);
  const tools = useUI((s) => s.dockTools);
  const order: DockTool[] = [...tools, ...DOCK_TOOLS.filter((t) => !tools.includes(t))];
  const set = (next: DockTool[]) => ui.set({ dockTools: next });
  const move = (t: DockTool, d: -1 | 1) => {
    const i = tools.indexOf(t);
    const j = i + d;
    if (i < 0 || j < 0 || j >= tools.length) return;
    const next = tools.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  return (
    <Sheet open={open} onClose={() => ui.set({ customizeOpen: false })} title="Customize Toolbar" icon="customize">
      <p className="mb-3 text-footnote text-label-2">Show the tools you use and put them in your order. Hidden tools still work from the keyboard.</p>
      <ul className="overflow-hidden rounded-[14px] bg-cell shadow-[0_0_0_0.5px_var(--hairline)]">
        {order.map((t) => {
          const c = TOOL_CATALOG.find((x) => x.tool === t)!;
          const on = tools.includes(t);
          const i = tools.indexOf(t);
          return (
            <li key={t} className="flex min-h-12 items-center gap-2 border-b border-hairline py-1 pr-2 pl-3 last:border-0">
              <span className={`flex h-8 w-8 items-center justify-center rounded-[9px] ${on ? 'bg-tint-soft text-on-tint-soft' : 'bg-fill text-label-2'}`}>
                <Icon name={c.icon} size={17} />
              </span>
              <span className={`flex-1 text-body ${on ? 'text-label' : 'text-label-2'}`}>{c.label}</span>
              <span className="text-footnote text-label-3 tabular-nums">{c.key}</span>
              <ToolButton icon="chevronUp" iconSize={13} label={`Move ${c.label} up`} disabled={!on || i === 0} onClick={() => move(t, -1)} />
              <ToolButton icon="chevronDown" iconSize={13} label={`Move ${c.label} down`} disabled={!on || i === tools.length - 1} onClick={() => move(t, 1)} />
              <Toggle
                checked={on}
                label={`Show ${c.label}`}
                onChange={(v) => {
                  if (v) set([...tools, t]);
                  else if (tools.length > 1) set(tools.filter((x) => x !== t));
                }}
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => set([...DOCK_TOOLS])}
        className="spring mt-3 flex h-11 w-full items-center justify-center rounded-full bg-fill text-subhead font-semibold text-on-tint-soft hover:bg-fill-2 active:scale-[0.98]"
      >
        Restore Default Toolbar
      </button>
    </Sheet>
  );
}
