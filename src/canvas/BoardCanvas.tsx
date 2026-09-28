import { useEffect, useRef } from 'react';
import { onImageLoaded, pruneImages, usedImageKeys } from '../engine/renderer';
import { boardTheme, type Appearance } from '../engine/theme';
import { board } from '../state/board';
import { ui } from '../state/ui';
import { useGlass } from '../ui/GlassProvider';
import { CanvasController, type ControllerEvents } from './controller';
import { setController } from './instance';
import { transitionCanvas } from './transitions';

interface BoardCanvasProps {
  appearance: Appearance;
  readOnly?: boolean;
  events?: ControllerEvents;
}

/**
 * Two stacked canvases, both direct children of the stage so the Liquid
 * Glass renderer can sample them with a fast drawImage:
 *  • scene — background + committed elements (repainted on change/pan)
 *  • live  — in-progress ink, previews, selection, laser (cheap to clear)
 */
export function BoardCanvas({ appearance, readOnly = false, events }: BoardCanvasProps) {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<CanvasController | null>(null);
  const { markRegion } = useGlass();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const c = new CanvasController(board, sceneRef.current!, liveRef.current!, boardTheme(appearance));
    c.readOnly = readOnly;
    ctrl.current = c;
    setController(c);
    c.updateCursor();
    const offImg = onImageLoaded(() => c.invalidate(true));
    const offUI = ui.subscribe(() => c.updateCursor());
    // Memory: when a different lesson loads, let go of the last one's decoded images.
    const offDoc = board.subscribe((ch) => ch.type === 'replace' && pruneImages(usedImageKeys(board.doc.pages)));
    return () => {
      offImg();
      offUI();
      offDoc();
      c.destroy();
      setController(null);
      ctrl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstTheme = useRef(true);
  useEffect(() => {
    // Light ⇄ dark crossfades instead of snapping.
    if (!firstTheme.current && sceneRef.current && liveRef.current) transitionCanvas(sceneRef.current, liveRef.current, { kind: 'fade' });
    firstTheme.current = false;
    ctrl.current?.setTheme(boardTheme(appearance));
  }, [appearance]);

  // Page changes slide; paper changes crossfade.
  useEffect(() => {
    const indexOf = (id: string) => board.doc.pages.findIndex((p) => p.id === id);
    let pageId = board.doc.activePage;
    let index = indexOf(pageId);
    let background = board.page.background;
    return board.subscribe((c) => {
      if (c.type === 'camera') return;
      const scene = sceneRef.current, live = liveRef.current;
      const nextId = board.doc.activePage;
      const nextBg = board.page.background;
      if (scene && live && c.type !== 'replace') {
        if (nextId !== pageId) {
          const nextIndex = indexOf(nextId);
          transitionCanvas(scene, live, { kind: 'slide', direction: nextIndex >= index ? 1 : -1 });
        } else if (nextBg !== background) {
          transitionCanvas(scene, live, { kind: 'fade' });
        }
      }
      pageId = nextId;
      index = indexOf(nextId);
      background = nextBg;
    });
  }, []);

  useEffect(() => {
    if (ctrl.current) ctrl.current.readOnly = readOnly;
  }, [readOnly]);

  useEffect(() => {
    let lastLive = 0;
    let trailing = 0;
    let pending: { x: number; y: number; w: number; h: number } | null = null;
    ctrl.current?.setEvents({
      ...eventsRef.current,
      onSceneRendered: (region) => {
        markRegion(region);
        eventsRef.current?.onSceneRendered?.(region);
      },
      onLiveRendered: (region) => {
        // Live ink near a toolbar refreshes its glass at ~20Hz — enough to
        // read as live while leaving the frame budget to the pen.
        if (region) {
          pending = pending
            ? { x: Math.min(pending.x, region.x), y: Math.min(pending.y, region.y), w: Math.max(pending.x + pending.w, region.x + region.w) - Math.min(pending.x, region.x), h: Math.max(pending.y + pending.h, region.y + region.h) - Math.min(pending.y, region.y) }
            : region;
        }
        const flush = () => {
          lastLive = performance.now();
          if (pending) markRegion(pending);
          pending = null;
        };
        clearTimeout(trailing);
        if (pending && performance.now() - lastLive > 50) flush();
        else if (pending) trailing = window.setTimeout(flush, 60);
        eventsRef.current?.onLiveRendered?.(region);
      },
      onEditText: (r) => eventsRef.current?.onEditText?.(r),
      onPresence: (p) => eventsRef.current?.onPresence?.(p),
      onFrame: (ms) => eventsRef.current?.onFrame?.(ms),
    });
  }, [markRegion]);

  return (
    <>
      <canvas ref={sceneRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <canvas
        ref={liveRef}
        className="absolute inset-0 h-full w-full touch-none"
        role="img"
        aria-label="Whiteboard canvas"
        data-testid="board"
      />
    </>
  );
}
