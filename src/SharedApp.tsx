import { useEffect, useRef, useState } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import { getController } from './canvas/instance';
import { saveLesson } from './engine/persistence';
import { readSharedFromLocation } from './engine/share';
import { isFlowDocument } from './engine/store';
import { uid } from './engine/geometry';
import { useAppearance } from './hooks/useAppearance';
import { Icon } from './icons/Icon';
import { board, useBoard } from './state/board';
import { CREDITS, toast, useUI } from './state/ui';
import { Glass } from './ui/Glass';
import { GlassProvider } from './ui/GlassProvider';
import { Toast } from './ui/Toast';
import { ToolButton } from './ui/controls';

/**
 * Read-only preview of a lesson shared as a link: page through it, zoom
 * and pan, or save a copy to your own lessons. Nothing can be edited here.
 */
export function SharedApp() {
  const appearance = useAppearance();
  const liquid = useUI((s) => s.liquidGlass && s.device !== 'mobile');
  const stage = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const title = useBoard((b) => b.doc.title);
  const index = useBoard((b) => b.doc.pages.findIndex((p) => p.id === b.doc.activePage));
  const count = useBoard((b) => b.doc.pages.length);

  useEffect(() => {
    readSharedFromLocation()
      .then((doc) => {
        if (!isFlowDocument(doc)) throw new Error('bad');
        board.load(doc);
        document.title = `${doc.title} — Flow`;
        setState('ready');
        requestAnimationFrame(() => getController()?.zoomToFit());
      })
      .catch(() => setState('error'));
  }, []);

  const go = (d: number) => {
    const pages = board.doc.pages;
    const next = pages[Math.max(0, Math.min(pages.length - 1, index + d))];
    if (next) {
      board.setActivePage(next.id);
      requestAnimationFrame(() => getController()?.zoomToFit());
    }
  };

  const saveCopy = async () => {
    const copy = structuredClone(board.doc);
    copy.id = uid();
    copy.updatedAt = Date.now();
    await saveLesson(copy);
    toast('Saved to your lessons');
    const u = new URL(location.href);
    u.search = `?lesson=${copy.id}`;
    u.hash = '';
    location.href = u.toString();
  };

  if (state === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-grouped p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-soft text-on-tint-soft"><Icon name="link" size={26} /></span>
        <p className="text-headline font-semibold">This link can’t be opened</p>
        <p className="max-w-sm text-subhead text-label-2">It may have been cut off when it was copied. Ask for the link again, or for the .flow file.</p>
        <a href={location.pathname} className="spring mt-2 flex h-11 items-center rounded-full bg-tint px-5 text-headline font-semibold text-white">Open Flow</a>
      </div>
    );
  }

  return (
    <GlassProvider root={stage} enabled={liquid}>
      <main ref={stage} className="fixed inset-0 overflow-hidden" data-liquid="off">
        <BoardCanvas appearance={appearance} readOnly />
        <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] left-4 z-20 max-w-[calc(100vw-32px)]" role="toolbar" aria-label="Shared lesson">
          <div className="flex items-center gap-1 p-1.5">
            <span className="flex h-11 items-center gap-2 rounded-full px-3 text-footnote font-semibold text-label-2">
              <Icon name="eye" size={16} /> Read-only
            </span>
            <span className="max-w-[40vw] truncate px-1 text-headline font-semibold tracking-title text-label">{state === 'ready' ? title : 'Opening…'}</span>
          </div>
        </Glass>
        <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 z-20 max-sm:top-auto max-sm:bottom-[max(16px,env(safe-area-inset-bottom))]" role="toolbar" aria-label="Pages">
          <div className="flex items-center gap-0.5 p-1.5">
            <ToolButton icon="chevronLeft" iconSize={15} label="Previous page" disabled={index <= 0} onClick={() => go(-1)} />
            <span className="min-w-12 text-center text-subhead font-semibold text-label tabular-nums" aria-live="polite">
              {index + 1}
              <span className="text-label-2"> / {count}</span>
            </span>
            <ToolButton icon="chevronRight" iconSize={15} label="Next page" disabled={index >= count - 1} onClick={() => go(1)} />
            <ToolButton icon="fit" iconSize={19} label="Zoom to fit" onClick={() => getController()?.zoomToFit()} />
            <button
              type="button"
              onClick={saveCopy}
              disabled={state !== 'ready'}
              className="spring ml-1 flex h-11 items-center gap-1.5 rounded-full bg-tint px-4 text-subhead font-semibold text-white active:scale-[0.97] disabled:opacity-40"
            >
              <Icon name="plus" size={14} /> Save a Copy
            </button>
          </div>
        </Glass>
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-caption text-label-3 max-sm:hidden">{CREDITS}</p>
      </main>
      <Toast />
    </GlassProvider>
  );
}
