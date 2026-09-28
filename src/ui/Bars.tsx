import { useEffect, useRef, useState } from 'react';
import { getController } from '../canvas/instance';
import { Icon, type IconName } from '../icons/Icon';
import type { Appearance } from '../engine/theme';
import type { Background } from '../engine/types';
import {
  alignSelection,
  annotateEquation,
  copyMathML,
  copyPng,
  copyShareLink,
  deleteSelection,
  exportPdf,
  exportSvg,
  pickPdf,
  distributeSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  rotateSelection,
  setLocked,
  ungroupSelection,
  exportPng,
  goToPage,
  newDocument,
  openDocument,
  openPresenter,
  redo,
  reorderSelection,
  saveDocument,
  undo,
} from '../state/actions';
import { board, useBoard } from '../state/board';
import { CREDITS, openElements, openEquation, ui, useUI, type AppearancePref, type DevicePref } from '../state/ui';

declare const __APP_VERSION__: string;
import { markIsOn, parasOf, setMark, spansOf, withSpans } from '../engine/richtext';
import { selectionUnits } from '../engine/arrange';
import type { ColorToken, EquationElement, TextElement } from '../engine/types';
import { ColorButton, FormatButtons, FORMATS, TextStyleButton, type FormatSpec, type MarkState, type TextStyleState } from './FormatBar';
import { channelSupported } from '../engine/sync';
import { BubbleGroup } from './Bubble';
import { Divider, Segmented, Toggle, ToolButton } from './controls';
import { Glass } from './Glass';
import { Logo } from './Logo';
import { Popover } from './Popover';

// ─── Top-left: identity, title, pages ────────────────────────────────

export function TitleBar({ onHome }: { onHome: () => void }) {
  const title = useBoard((b) => b.doc.title);
  const pageIndex = useBoard((b) => b.doc.pages.findIndex((p) => p.id === b.doc.activePage));
  const pageCount = useBoard((b) => b.doc.pages.length);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);

  return (
    <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] left-4 z-20" role="toolbar" aria-label="Lesson">
      <div className="flex items-center gap-0.5 p-1.5">
        <button
          type="button"
          onClick={onHome}
          aria-label="All lessons"
          title="All lessons"
          className="spring flex h-11 items-center gap-0.5 rounded-full pr-1.5 pl-2 text-tint hover:bg-fill active:scale-[0.94]"
        >
          <Icon name="chevronLeft" size={14} />
          <Logo size={30} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => board.setTitle(draft.trim() || 'Untitled Lesson')}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          aria-label="Lesson title"
          size={Math.max(6, Math.min(28, draft.length + 1))}
          className="h-11 max-w-[28vw] truncate max-sm:hidden rounded-xl bg-transparent px-2 text-headline font-semibold tracking-title text-label outline-none focus:bg-fill"
        />
        <span className="max-sm:hidden"><Divider /></span>
        <ToolButton icon="pages" label="Pages" shortcut="⌥P" active={useUI((s) => s.pagesOpen)} onClick={() => ui.set({ pagesOpen: !ui.get().pagesOpen })} />
        <ToolButton icon="chevronLeft" label="Previous page" shortcut="PgUp" iconSize={15} disabled={pageIndex <= 0} onClick={() => goToPage(-1)} className="max-sm:hidden" />
        <span className="min-w-12 text-center text-subhead font-semibold text-label tabular-nums max-sm:hidden" aria-live="polite">
          {pageIndex + 1}
          <span className="text-label-2"> / {pageCount}</span>
        </span>
        <ToolButton
          icon={pageIndex >= pageCount - 1 ? 'plus' : 'chevronRight'}
          label={pageIndex >= pageCount - 1 ? 'New page' : 'Next page'}
          shortcut="PgDn"
          iconSize={15}
          onClick={() => (pageIndex >= pageCount - 1 ? board.addPage() : goToPage(1))}
          className="max-sm:hidden"
        />
      </div>
    </Glass>
  );
}

// ─── Top-right: history, lesson tools, share, settings ───────────────

const BACKGROUNDS: { value: Background; icon: IconName; label: string }[] = [
  { value: 'blank', icon: 'bgBlank', label: 'Blank' },
  { value: 'dots', icon: 'bgDots', label: 'Dots' },
  { value: 'grid', icon: 'bgGrid', label: 'Grid' },
  { value: 'lined', icon: 'bgLined', label: 'Lined' },
  { value: 'graph', icon: 'bgGraph', label: 'Graph' },
];

function MenuItem({ icon, label, hint, onClick }: { icon: IconName; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="spring flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body text-label hover:bg-fill active:bg-fill-2">
      <Icon name={icon} size={19} className="text-tint" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-footnote text-label-2">{hint}</span>}
    </button>
  );
}

/** A tile in the Apps menu: colored symbol, name, and live state. */
function AppTile({ icon, color, label, detail, on, shortcut, onClick }: { icon: IconName; color: string; label: string; detail: string; on?: boolean; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`spring flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-[16px] p-3 text-left active:scale-[0.96] ${on ? 'bg-tint-soft' : 'bg-fill hover:bg-fill-2'}`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] text-white" style={{ background: color }}>
          <Icon name={icon} size={17} />
        </span>
        {on && <Icon name="checkFill" size={18} className="text-tint" />}
      </span>
      <span>
        <span className={`block text-subhead leading-tight font-semibold ${on ? 'text-on-tint-soft' : 'text-label'}`}>{label}</span>
        <span className={`block text-caption ${on ? 'text-on-tint-soft' : 'text-label-2'}`}>{detail}</span>
      </span>
    </button>
  );
}

export function ActionsBar({ appearance }: { appearance: Appearance }) {
  const canUndo = useBoard((b) => b.canUndo);
  const canRedo = useBoard((b) => b.canRedo);
  const background = useBoard((b) => b.page.background);
  const timerOpen = useUI((s) => s.timerOpen);
  const curtain = useUI((s) => s.curtain.on);
  const [menu, setMenu] = useState<null | 'share' | 'paper' | 'settings' | 'apps'>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const appsRef = useRef<HTMLButtonElement>(null);
  const paperRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const close = () => setMenu(null);
  const toggle = (m: typeof menu) => setMenu((cur) => (cur === m ? null : m));
  const s = useUI((x) => x);

  return (
    <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 z-20" role="toolbar" aria-label="Actions">
      <div className="flex items-center gap-0.5 p-1.5">
        <ToolButton icon="undo" label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo} />
        <ToolButton icon="redo" label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo} />
        <span className="max-sm:hidden"><Divider /></span>
        <ToolButton ref={paperRef} icon={BACKGROUNDS.find((b) => b.value === background)?.icon ?? 'bgDots'} label="Paper" active={menu === 'paper'} onClick={() => toggle('paper')} className="max-sm:hidden" />
        {channelSupported() && <ToolButton icon="present" label="Student view" onClick={openPresenter} className="max-md:hidden mobile:hidden" />}
        <ToolButton ref={appsRef} icon="apps" label="Apps" iconSize={19} active={menu === 'apps'} onClick={() => toggle('apps')}>
          {(timerOpen || curtain) && menu !== 'apps' && <span aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-tint shadow-[0_0_0_2px_var(--bg)]" />}
        </ToolButton>
        <span className="max-sm:hidden"><Divider /></span>
        <ToolButton ref={shareRef} icon="share" label="Share & export" active={menu === 'share'} onClick={() => toggle('share')} />
        <ToolButton ref={settingsRef} icon="settings" label="Settings" active={menu === 'settings'} onClick={() => toggle('settings')} />
      </div>

      <Popover open={menu === 'apps'} onClose={close} anchor={appsRef} placement="bottom" label="Apps" className="w-[320px] max-w-[calc(100vw-24px)] p-2">
        <p className="px-2 pt-1 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Apps</p>
        <div className="grid grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
          <AppTile icon="timer" color="#FF9500" label="Timer" detail={timerOpen ? 'On' : 'Countdown'} on={timerOpen} onClick={() => ui.set({ timerOpen: !timerOpen })} />
          <AppTile icon="curtain" color="#5856D6" label="Screen Hider" detail={curtain ? 'On' : 'Reveal steps'} on={curtain} shortcut="C" onClick={() => ui.set({ curtain: { ...ui.get().curtain, on: !curtain } })} />
          <AppTile icon="equation" color="var(--brand)" label="LaTeX Equation" detail="Typeset math" onClick={() => { close(); openEquation(); }} />
          <AppTile icon="atom" color="#34C759" label="Elements" detail="Bohr, orbitals & more" onClick={() => { close(); openElements(); }} />
        </div>
      </Popover>

      <Popover open={menu === 'paper'} onClose={close} anchor={paperRef} placement="bottom" label="Paper" className="w-[300px] p-2">
        <p className="px-2 pt-1 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Paper for this page</p>
        <BubbleGroup active={background} variant="soft" className="grid grid-cols-5 gap-1 [&>span]:rounded-2xl!">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              type="button"
              aria-pressed={background === b.value}
              data-bubble={b.value}
              onClick={() => board.setPageProps({ background: b.value })}
              className={`spring relative flex flex-col items-center gap-1 rounded-2xl py-2 text-caption font-medium ${background === b.value ? 'text-on-tint-soft' : 'text-label hover:bg-fill'}`}
            >
              <Icon name={b.icon} size={24} />
              {b.label}
            </button>
          ))}
        </BubbleGroup>
        <div className="mt-2 flex min-h-11 items-center justify-between gap-3 border-t border-hairline px-2 pt-2">
          <div>
            <p className="text-subhead text-label">Snap to grid</p>
            <p className="text-footnote text-label-2">Moves and new shapes align · ⌘'</p>
          </div>
          <Toggle checked={s.snapGrid} onChange={(v) => ui.set({ snapGrid: v })} label="Snap to grid" />
        </div>
      </Popover>

      <Popover open={menu === 'share'} onClose={close} anchor={shareRef} placement="bottom" label="Share and export" className="w-[280px] p-1.5">
        <MenuItem icon="link" label="Copy read-only link" onClick={() => { close(); copyShareLink(); }} />
        <MenuItem icon="present" label="Open student view" onClick={() => { close(); openPresenter(); }} />
        <div className="mx-3 my-1 h-px bg-hairline" />
        <p className="px-3 pt-1 pb-0.5 text-footnote font-semibold tracking-wide text-label-2 uppercase">Export</p>
        <MenuItem icon="image" label="Page as PNG" onClick={() => { close(); exportPng(appearance); }} />
        <MenuItem icon="photoStack" label="Page as SVG" hint="Vector" onClick={() => { close(); exportSvg(appearance); }} />
        <MenuItem icon="exportFile" label="Lesson as PDF" hint="All pages" onClick={() => { close(); exportPdf(appearance); }} />
        <MenuItem icon="duplicate" label="Copy page image" onClick={() => { close(); copyPng(appearance); }} />
        <div className="mx-3 my-1 h-px bg-hairline" />
        <MenuItem icon="importFile" label="Import PDF…" onClick={() => { close(); pickPdf(); }} />
        <MenuItem icon="open" label="Save lesson (.flow)" hint="⌘S" onClick={() => { close(); saveDocument(); }} />
        <MenuItem icon="share" label="Open lesson…" hint="⌘O" onClick={() => { close(); openDocument(); }} />
        <MenuItem icon="plus" label="New lesson" onClick={() => { close(); newDocument(); }} />
      </Popover>

      <Popover open={menu === 'settings'} onClose={close} anchor={settingsRef} placement="bottom" label="Settings" className="w-[340px] max-w-[calc(100vw-24px)] p-4">
        <div className="mb-3 sm:hidden">
          <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Paper</p>
          <Segmented<Background>
            label="Paper"
            value={background}
            onChange={(v) => board.setPageProps({ background: v })}
            options={BACKGROUNDS.map((b) => ({ value: b.value, label: <Icon name={b.icon} size={17} />, title: b.label }))}
          />
        </div>
        <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Appearance</p>
        <Segmented<AppearancePref>
          label="Appearance"
          value={s.appearance}
          onChange={(v) => ui.set({ appearance: v })}
          options={[
            { value: 'light', label: <span className="flex items-center gap-1.5"><Icon name="sun" size={15} />Light</span> },
            { value: 'dark', label: <span className="flex items-center gap-1.5"><Icon name="moon" size={15} />Dark</span> },
            { value: 'system', label: 'Auto' },
          ]}
        />
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 mobile:hidden">
          <div>
            <p className="text-subhead text-label">Liquid Glass</p>
            <p className="text-footnote text-label-2">WebGL refraction on toolbars</p>
          </div>
          <Toggle checked={s.liquidGlass} onChange={(v) => ui.set({ liquidGlass: v })} label="Liquid Glass" />
        </div>
        <p className="mt-4 mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Device</p>
        <Segmented<DevicePref>
          label="Device"
          value={s.device ?? 'desktop'}
          onChange={(v) => ui.set({ device: v })}
          options={[
            { value: 'mobile', label: <span className="flex items-center gap-1.5"><Icon name="tablet" size={15} />Mobile</span> },
            { value: 'desktop', label: <span className="flex items-center gap-1.5"><Icon name="desktop" size={15} />Desktop</span> },
          ]}
        />
        <div className="mt-3 border-t border-hairline pt-2">
          <MenuItem icon="customize" label="Customize Toolbar…" onClick={() => { close(); ui.set({ customizeOpen: true }); }} />
          <span className="mobile:hidden"><MenuItem icon="keyboard" label="Keyboard Shortcuts" hint="?" onClick={() => { close(); ui.set({ shortcutsOpen: true }); }} /></span>
        </div>
        <p className="mt-2 text-center text-caption text-label-3">{CREDITS} · {__APP_VERSION__}</p>
      </Popover>
    </Glass>
  );
}

// ─── Bottom-right: zoom ──────────────────────────────────────────────

export function ZoomBar() {
  const z = useBoard((b) => b.page.camera.z);
  return (
    <Glass radius={26} className="absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 max-lg:hidden mobile:hidden" role="toolbar" aria-label="Zoom">
      <div className="flex items-center gap-0.5 p-1.5">
        <ToolButton icon="minus" label="Zoom out" shortcut="⌘−" iconSize={15} onClick={() => getController()?.zoomBy(1 / 1.25)} />
        <button
          type="button"
          onClick={() => getController()?.setZoom(1)}
          title="Actual size (⌘0)"
          className="spring h-11 min-w-14 rounded-full px-1 text-subhead font-semibold text-label tabular-nums hover:bg-fill"
        >
          {Math.round(z * 100)}%
        </button>
        <ToolButton icon="plus" label="Zoom in" shortcut="⌘+" iconSize={15} onClick={() => getController()?.zoomBy(1.25)} />
        <ToolButton icon="fit" label="Zoom to fit" shortcut="⌘1" iconSize={19} onClick={() => getController()?.zoomToFit()} />
      </div>
    </Glass>
  );
}

// ─── Contextual selection actions ────────────────────────────────────

function ArrangeButton({ count, grouped, locked, tab }: { count: number; grouped: boolean; locked: boolean; tab: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const units = useUI((s) => selectionUnits(board.page.elements, s.selection).length);
  const snap = useUI((s) => s.snapGrid);
  const Btn = ({ icon, label, shortcut, onClick, disabled }: { icon: IconName; label: string; shortcut?: string; onClick: () => void; disabled?: boolean }) => (
    <ToolButton icon={icon} iconSize={18} label={label} shortcut={shortcut} disabled={disabled} onClick={onClick} className="flex-1" />
  );
  return (
    <>
      <ToolButton ref={ref} icon="layers" iconSize={19} label="Arrange" active={open} tabIndex={tab} onClick={() => setOpen((v) => !v)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top" label="Arrange" className="w-[320px] max-w-[calc(100vw-24px)] p-3">
        <p className="mb-1.5 px-1 text-footnote font-semibold tracking-wide text-label-2 uppercase">Layer</p>
        <div className="flex rounded-[14px] bg-fill p-0.5">
          <Btn icon="front" label="Bring to front" shortcut="⇧]" onClick={() => reorderSelection('front')} />
          <Btn icon="forward" label="Bring forward" shortcut="]" onClick={() => reorderSelection('forward')} />
          <Btn icon="backward" label="Send backward" shortcut="[" onClick={() => reorderSelection('backward')} />
          <Btn icon="back" label="Send to back" shortcut="⇧[" onClick={() => reorderSelection('back')} />
        </div>
        <p className="mt-3 mb-1.5 px-1 text-footnote font-semibold tracking-wide text-label-2 uppercase">Align{units < 2 ? ' · select 2 or more' : ''}</p>
        <div className="flex rounded-[14px] bg-fill p-0.5">
          <Btn icon="alignObjLeft" label="Align left edges" disabled={units < 2} onClick={() => alignSelection('left')} />
          <Btn icon="alignObjCenter" label="Align centers" disabled={units < 2} onClick={() => alignSelection('center')} />
          <Btn icon="alignObjRight" label="Align right edges" disabled={units < 2} onClick={() => alignSelection('right')} />
          <Btn icon="alignObjTop" label="Align top edges" disabled={units < 2} onClick={() => alignSelection('top')} />
          <Btn icon="alignObjMiddle" label="Align middles" disabled={units < 2} onClick={() => alignSelection('middle')} />
          <Btn icon="alignObjBottom" label="Align bottom edges" disabled={units < 2} onClick={() => alignSelection('bottom')} />
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <div className="flex flex-1 rounded-[14px] bg-fill p-0.5">
            <Btn icon="distributeH" label="Distribute horizontally" disabled={units < 3} onClick={() => distributeSelection('x')} />
            <Btn icon="distributeV" label="Distribute vertically" disabled={units < 3} onClick={() => distributeSelection('y')} />
          </div>
          <div className="flex flex-1 rounded-[14px] bg-fill p-0.5">
            <Btn icon="group" label="Group" shortcut="⌘G" disabled={count < 2 || (grouped && units < 2)} onClick={groupSelection} />
            <Btn icon="ungroup" label="Ungroup" shortcut="⇧⌘G" disabled={!grouped} onClick={ungroupSelection} />
          </div>
        </div>
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 border-t border-hairline pt-2">
          <span className="text-subhead text-label">Snap to grid</span>
          <Toggle checked={snap} onChange={(v) => ui.set({ snapGrid: v })} label="Snap to grid" />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setLocked(!locked);
          }}
          className="spring mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-fill text-subhead font-semibold text-label hover:bg-fill-2 active:scale-[0.98]"
        >
          <Icon name={locked ? 'unlock' : 'lock'} size={16} /> {locked ? 'Unlock' : 'Lock'}
        </button>
      </Popover>
    </>
  );
}

/** Style state of the selected text elements (the first one leads). */
function textStyleOf(texts: TextElement[]): TextStyleState {
  const t = texts[0];
  return { font: t.font ?? 'sans', fontSize: t.fontSize, align: t.align ?? 'left', wraps: texts.every((x) => !!x.note) };
}

export function SelectionBar({ appearance }: { appearance: Appearance }) {
  const selection = useUI((s) => s.selection);
  const tool = useUI((s) => s.tool);
  const elements = useBoard((b) => b.page.elements);
  const count = selection.size;
  const visible = count > 0 && tool === 'select';
  const tab = visible ? 0 : -1;

  // Contextual actions: formatting for text, re-editing and transforms for equations.
  const selected = elements.filter((e) => selection.has(e.id));
  const texts = selected.filter((e): e is TextElement => e.type === 'text');
  const allText = texts.length > 0 && texts.length === selected.length;
  const equation = selected.length === 1 && selected[0].type === 'equation' ? (selected[0] as EquationElement) : null;
  const boxedOnly = selected.length > 0 && selected.every((e) => e.type === 'equation' || e.type === 'image');
  const grouped = selected.some((e) => e.groupId);
  const locked = selected.some((e) => e.locked);
  const link = texts.length === 1 ? spansOf(texts[0]).find((s) => s.marks?.link)?.marks?.link : undefined;

  const marks: MarkState = {};
  if (allText) {
    for (const f of FORMATS) marks[f.mark] = texts.every((t) => markIsOn(spansOf(t), f.mark));
    const lists = texts.flatMap((t) => parasOf(t).map((p) => p.list));
    marks.list = lists.every((l) => l && l === lists[0]) ? lists[0] : undefined;
  }
  const toggle = (f: FormatSpec) => board.replaceElements(texts.map((t) => withSpans(t, setMark(spansOf(t), f.mark, !marks[f.mark]))));
  const setColor = (c: ColorToken) => board.replaceElements(texts.map((t) => withSpans({ ...t, color: c }, setMark(spansOf(t), 'color', undefined))));
  const setStyle = (patch: Partial<Omit<TextStyleState, 'wraps'>>) => {
    const lead = texts[0];
    board.replaceElements(
      texts.map((t) => {
        const next: TextElement = { ...t };
        if (patch.font) {
          if (patch.font === 'sans') delete next.font;
          else next.font = patch.font;
        }
        if (patch.align) {
          if (patch.align === 'left' || (patch.align === 'justify' && !t.note)) delete next.align;
          else next.align = patch.align;
        }
        if (patch.fontSize) next.fontSize = t.fontSize * (patch.fontSize / lead.fontSize);
        return next;
      }),
    );
  };
  const toggleList = (list: 'bullet' | 'number') =>
    board.replaceElements(texts.map((t) => withSpans(t, spansOf(t), parasOf(t).map(() => (marks.list === list ? {} : { list })))));

  return (
    <Glass
      radius={24}
      aria-hidden={!visible}
      className={`spring absolute bottom-[calc(max(16px,env(safe-area-inset-bottom))+72px)] left-1/2 z-20 max-w-[calc(100vw-24px)] -translate-x-1/2 ${visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      role="toolbar"
      aria-label="Selection"
    >
      <div className="flex items-center gap-0.5 overflow-x-auto p-1 [scrollbar-width:none]" inert={!visible}>
        <span className="px-3 text-footnote font-semibold whitespace-nowrap text-label-2 tabular-nums max-sm:hidden" aria-live="polite">{count} selected</span>
        {allText && (
          <>
            <FormatButtons state={marks} onToggle={toggle} tabIndex={tab} />
            <ColorButton value={texts[0].color} onPick={setColor} appearance={appearance} tabIndex={tab} />
            <TextStyleButton style={textStyleOf(texts)} marks={marks} onStyle={setStyle} onToggle={toggle} onList={toggleList} tabIndex={tab} />
            {link && <ToolButton icon="link" iconSize={17} label={`Open ${link}`} tabIndex={tab} onClick={() => window.open(link, '_blank', 'noopener')} />}
            <Divider />
          </>
        )}
        {equation && (
          <>
            <button
              type="button"
              tabIndex={tab}
              onClick={() => openEquation(equation.id)}
              className="spring flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-subhead font-semibold text-tint hover:bg-fill active:scale-[0.94]"
            >
              <Icon name="equation" size={17} /> Edit
            </button>
            <ToolButton icon="annotate" iconSize={18} label="Annotate" tabIndex={tab} onClick={() => annotateEquation(equation.id)} />
            <ToolButton icon="clipboard" iconSize={18} label="Copy as MathML" tabIndex={tab} onClick={() => copyMathML(equation.id)} />
          </>
        )}
        {boxedOnly && (
          <>
            <ToolButton icon="rotate" iconSize={18} label="Rotate 90°" tabIndex={tab} onClick={() => rotateSelection(90)} />
            <ToolButton icon="flipH" iconSize={18} label="Flip horizontal" tabIndex={tab} onClick={() => flipSelection('x')} />
            <ToolButton icon="flipV" iconSize={18} label="Flip vertical" tabIndex={tab} onClick={() => flipSelection('y')} />
            <Divider />
          </>
        )}
        <ArrangeButton count={count} grouped={grouped} locked={locked} tab={tab} />
        <ToolButton icon="duplicate" label="Duplicate" shortcut="⌘D" iconSize={19} tabIndex={tab} onClick={duplicateSelection} />
        <ToolButton icon="trash" label="Delete" shortcut="⌫" iconSize={19} className="text-danger!" tabIndex={tab} onClick={deleteSelection} />
      </div>
    </Glass>
  );
}
