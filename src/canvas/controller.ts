import { eraseStrokeSegment, expandGroups, gridStep, replaceWithPieces, snapTo } from '../engine/arrange';
import { optimizePoints, strokePath } from '../engine/freehand';
import {
  elementBounds,
  fitRect,
  hitTestPoint,
  hitTestSegment,
  inflate,
  linkAt,
  pointInRect,
  rectFromPoints,
  rectsIntersect,
  scaleElement,
  screenToWorld,
  translateElement,
  uid,
  unionRects,
  worldToScreen,
  zoomAt,
} from '../engine/geometry';
import { snapToRing } from '../engine/presets';
import { recognize, type Recognized } from '../engine/recognize';
import { drawBackground, drawElement, HIGHLIGHT_ALPHA, setWorldTransform } from '../engine/renderer';
import { quantizeScale, TileCache } from '../engine/tiles';
import type { BoardStore, Change, Op } from '../engine/store';
import type { BoardTheme } from '../engine/theme';
import type { BoardElement, Camera, Rect, ShapeElement, StrokeElement, TextElement, Vec } from '../engine/types';
import { openEquation, toast, ui } from '../state/ui';

/** Live, not-yet-committed stroke — also what we broadcast to viewers. */
export interface LiveStroke {
  tool: StrokeElement['tool'];
  points: number[];
  color: string;
  size: number;
  pressure: boolean;
  smoothing?: number;
  uniform?: boolean;
}

export interface LaserPoint {
  x: number;
  y: number;
  /** Epoch ms, so trails fade in sync across windows. */
  t: number;
}

export interface ControllerEvents {
  /**
   * A canvas was repainted. `region` is the changed area in screen px, or
   * null for "everything" — lets glass above the board refresh only the
   * bars that actually sit over new pixels.
   */
  onSceneRendered?: (region: Rect | null) => void;
  onLiveRendered?: (region: Rect | null) => void;
  /** Ask the UI to open the inline text editor. */
  onEditText?: (req: { element: TextElement; isNew: boolean }) => void;
  /** Stream ephemeral presence to viewers (laser, in-progress ink). */
  onPresence?: (p: { laser?: LaserPoint[]; live?: LiveStroke | null }) => void;
  /** Frame timing samples (ms) for the perf HUD / benchmarks. */
  onFrame?: (ms: number) => void;
}

type Interaction =
  | { kind: 'draw'; pointerId: number; stroke: LiveStroke; minDist: number; holdAt: Vec; holdTimer: number; snapped: Recognized | null }
  | { kind: 'erase'; pointerId: number; last: Vec; erased: Set<string>; pieces: Map<string, BoardElement[]> }
  | { kind: 'polygon'; pts: Vec[]; cursor: Vec }
  | { kind: 'laser'; pointerId: number }
  | { kind: 'shape'; pointerId: number; start: Vec; end: Vec }
  | { kind: 'pan'; pointerId: number; start: Vec; cam: Camera }
  | { kind: 'pinch'; startDist: number; startMid: Vec; cam: Camera }
  | { kind: 'move'; pointerId: number; start: Vec; originals: BoardElement[]; moved: BoardElement[]; dragged: boolean }
  | { kind: 'scale'; pointerId: number; origin: Vec; startDist: number; originals: BoardElement[]; moved: BoardElement[] }
  | { kind: 'marquee'; pointerId: number; start: Vec; end: Vec; additive: boolean };

const LASER_LIFETIME = 900;
const HOLD_TO_SNAP_MS = 520;
const HANDLE_R = 9;
const SETTLE_MS = 160;

export class CanvasController {
  private sceneCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private sceneDirty = true;
  private liveDirty = true;
  private hidden = new Set<string>();
  private tiles: TileCache;
  private lastCameraMove = 0;
  private settleTimer = 0;
  /** World rects changed since the last composite (glass refresh), or 'all'. */
  private sceneChanges: Rect[] | 'all' = 'all';
  private interaction: Interaction | null = null;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private penSeen = false;
  private spaceDown = false;
  private hover: Vec | null = null;
  private laser: LaserPoint[] = [];
  private remoteLaser: LaserPoint[] = [];
  private remoteLive: LiveStroke | null = null;
  private unsub: () => void;
  private ro: ResizeObserver;
  readOnly = false;

  constructor(
    private store: BoardStore,
    private scene: HTMLCanvasElement,
    private live: HTMLCanvasElement,
    private theme: BoardTheme,
    private events: ControllerEvents = {},
  ) {
    this.sceneCtx = scene.getContext('2d', { alpha: false })!;
    // Low-latency path for ink: skips the compositor's double buffering where supported.
    this.liveCtx = live.getContext('2d', { desynchronized: true })!;
    this.tiles = new TileCache(() => this.store.page.elements, (id) => this.hidden.has(id), theme);
    if (new URLSearchParams(location.search).has('bench')) (window as unknown as { __flowTiles: TileCache }).__flowTiles = this.tiles;
    this.unsub = store.subscribe(this.onStoreChange);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(live);
    this.resize();
    this.bindEvents();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.settleTimer);
    this.tiles.clear();
    this.unsub();
    this.ro.disconnect();
    this.unbindEvents();
  }

  // ─── Public API ─────────────────────────────────────────────────────

  get camera() {
    return this.store.page.camera;
  }

  get viewport() {
    return { width: this.width, height: this.height };
  }

  setTheme(theme: BoardTheme) {
    this.theme = theme;
    this.tiles.setTheme(theme);
    this.invalidate();
  }

  setEvents(events: ControllerEvents) {
    this.events = events;
  }

  /** Hide elements from the scene (e.g. while their text is being edited). */
  setHidden(ids: Iterable<string>) {
    this.updateHidden(new Set(ids));
  }

  /** Swap the hidden set, re-rasterizing only tiles under elements that changed. */
  private updateHidden(next: Set<string>) {
    const changed = new Set<string>();
    for (const id of next) if (!this.hidden.has(id)) changed.add(id);
    for (const id of this.hidden) if (!next.has(id)) changed.add(id);
    this.hidden = next;
    if (!changed.size) return;
    for (const el of this.store.page.elements) if (changed.has(el.id)) this.invalidateRect(elementBounds(el));
    this.liveDirty = true;
    this.schedule();
  }

  private invalidateRect(r: Rect) {
    this.tiles.invalidate(r);
    if (this.sceneChanges !== 'all') this.sceneChanges.push(r);
    this.sceneDirty = true;
  }

  private invalidateAll(clearTiles: boolean) {
    if (clearTiles) this.tiles.clear();
    this.sceneChanges = 'all';
    this.sceneDirty = true;
  }

  /** Repaint everything; pass true when cached rasters are stale (e.g. an image decoded). */
  invalidate(clearTiles = false) {
    this.invalidateAll(clearTiles);
    this.liveDirty = true;
    this.schedule();
  }

  worldCenter(): Vec {
    return screenToWorld(this.camera, this.width / 2, this.height / 2);
  }

  zoomBy(factor: number, at?: Vec) {
    const p = at ?? { x: this.width / 2, y: this.height / 2 };
    this.store.setCamera(zoomAt(this.camera, p.x, p.y, this.camera.z * factor));
  }

  setZoom(z: number) {
    this.store.setCamera(zoomAt(this.camera, this.width / 2, this.height / 2, z));
  }

  /** Frame all content (or reset to origin when empty). */
  zoomToFit() {
    const r = unionRects(this.store.page.elements.map(elementBounds));
    if (!r) this.store.setCamera({ x: -this.width / 2, y: -this.height / 2, z: 1 });
    else this.store.setCamera(fitRect(r, this.width, this.height));
  }

  selectionBounds(): Rect | null {
    const sel = ui.get().selection;
    if (!sel.size) return null;
    return unionRects(this.store.page.elements.filter((e) => sel.has(e.id)).map(elementBounds));
  }

  /** Open the inline editor on a text element (e.g. a new equation annotation). */
  editText(element: TextElement, isNew: boolean) {
    this.events.onEditText?.({ element, isNew });
  }

  /** Receive viewer-side presence from the tutor window. */
  setRemotePresence(p: { laser?: LaserPoint[]; live?: LiveStroke | null }) {
    if (p.laser) this.remoteLaser = p.laser;
    if (p.live !== undefined) this.remoteLive = p.live;
    this.liveDirty = true;
    this.schedule();
  }

  /** Interrupt any in-flight gesture (tool switch, page change). */
  cancelInteraction() {
    const it = this.interaction;
    if (it?.kind === 'draw') clearTimeout(it.holdTimer);
    this.interaction = null;
    if (it && (it.kind === 'move' || it.kind === 'scale' || it.kind === 'erase')) this.updateHidden(new Set());
    if (it?.kind === 'polygon') this.commitPolygon(it);
    this.events.onPresence?.({ live: null });
    this.invalidate();
  }

  // ─── Store wiring ───────────────────────────────────────────────────

  private onStoreChange = (c: Change) => {
    if (c.type === 'op') {
      const page = this.store.page;
      const flat: Op[] = [];
      const collect = (o: Op) => (o.kind === 'batch' ? o.ops.forEach(collect) : flat.push(o));
      collect(c.op);
      for (const op of flat) this.applyChange(op, c.appendOnly && flat.length === 1);
      // Drop selection entries that no longer exist.
      const sel = ui.get().selection;
      if (sel.size) {
        const ids = new Set(page.elements.map((e) => e.id));
        const next = new Set([...sel].filter((id) => ids.has(id)));
        if (next.size !== sel.size) ui.set({ selection: next });
      }
      this.liveDirty = true;
    } else if (c.type === 'camera') {
      if (c.pageId !== this.store.page.id) return;
      this.lastCameraMove = performance.now();
      // Once motion stops, re-rasterize at the exact scale for crisp ink.
      clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => this.invalidate(), SETTLE_MS + 20);
      this.invalidateAll(false);
      this.liveDirty = true;
    } else {
      this.cancelInteraction();
      ui.set({ selection: new Set() });
      this.invalidateAll(true);
      this.liveDirty = true;
    }
    this.schedule();
  };

  private applyChange(op: Op, appendOnly: boolean) {
    {
      const page = this.store.page;
      if (op.kind === 'elements') {
        if (op.pageId !== page.id) return;
        if (appendOnly) {
          // Fast path: new ink is painted straight into the cached tiles.
          const els = op.added.map((a) => a.el);
          this.tiles.append(els, this.tileKey());
          if (this.sceneChanges !== 'all') this.sceneChanges.push(...els.map(elementBounds));
          this.sceneDirty = true;
        } else if (op.removed.length + op.added.length > 400) {
          this.invalidateAll(true);
        } else {
          for (const p of [...op.removed, ...op.added]) this.invalidateRect(elementBounds(p.el));
        }
      } else if (op.kind !== 'title') {
        // Page structure / paper: tiles only depend on elements.
        this.invalidateAll(op.kind === 'page' || op.kind === 'movePage');
      }
    }
  }

  // ─── Sizing & frame loop ────────────────────────────────────────────

  private resize() {
    const rect = this.live.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    for (const c of [this.scene, this.live]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    // First layout: centre the world origin for fresh pages.
    const page = this.store.page;
    if (page.elements.length === 0 && page.camera.x === 0 && page.camera.y === 0) {
      page.camera = { x: -w / 2, y: -h / 3, z: 1 };
    }
    this.invalidate();
  }

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = () => {
    this.raf = 0;
    const t0 = performance.now();
    let sceneChanged = false;
    let sceneRegion: Rect | null = null;
    let animating = false;
    if (this.sceneDirty) {
      this.sceneDirty = false;
      const complete = this.renderScene();
      // Tiles still rasterizing: keep compositing next frame.
      if (!complete) {
        this.sceneDirty = true;
        animating = true;
      }
      const changes = this.sceneChanges;
      sceneRegion = changes === 'all' ? null : this.toScreenRect(unionRects(changes));
      sceneChanged = changes === 'all' || changes.length > 0;
      this.sceneChanges = complete ? [] : 'all';
    }
    if (this.liveDirty || this.laser.length || this.remoteLaser.length) {
      this.liveRects = [];
      animating = this.renderLive() || animating;
      this.liveDirty = false;
      // Changed area = what was drawn last frame (now cleared) ∪ this frame.
      const now = unionRects(this.liveRects);
      const region = unionRects([now, this.lastLiveRect].filter((r): r is Rect => !!r));
      this.lastLiveRect = now;
      if (region) this.events.onLiveRendered?.(region);
    }
    if (sceneChanged) this.events.onSceneRendered?.(sceneRegion);
    this.events.onFrame?.(performance.now() - t0);
    if (animating) this.schedule();
  };

  private liveRects: Rect[] = [];
  private lastLiveRect: Rect | null = null;

  private toScreenRect(r: Rect | null): Rect | null {
    if (!r) return null;
    const cam = this.camera;
    const p = worldToScreen(cam, r.x, r.y);
    return { x: p.x, y: p.y, w: r.w * cam.z, h: r.h * cam.z };
  }

  /** Record a world-space rect drawn on the live layer this frame. */
  private markLive(r: Rect | null, pad = 0) {
    const s = this.toScreenRect(r);
    if (s) this.liveRects.push(inflate(s, pad));
  }

  /** Tile scale: quantized while the camera moves, exact once settled. */
  private tileKey() {
    const d = this.camera.z * this.dpr;
    const q = quantizeScale(d);
    const moving = performance.now() - this.lastCameraMove < SETTLE_MS;
    return moving || Math.abs(q - d) / d < 0.002 ? q : d;
  }

  /** Background (screen space) + cached element tiles. Returns false while tiles are pending. */
  private renderScene(): boolean {
    const ctx = this.sceneCtx;
    const page = this.store.page;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawBackground(ctx, page.background, this.camera, this.width, this.height, this.theme);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Leave headroom for ink / motion; missing tiles show stand-ins meanwhile.
    const moving = performance.now() - this.lastCameraMove < SETTLE_MS;
    const budget = this.interaction ? 4 : moving ? 5 : 12;
    return this.tiles.composite(ctx, this.camera, this.dpr, this.width, this.height, this.tileKey(), budget);
  }

  /** Returns true while something is animating (laser fade). */
  private renderLive(): boolean {
    const ctx = this.liveCtx;
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.live.width, this.live.height);
    setWorldTransform(ctx, cam, this.dpr);

    const it = this.interaction;
    if (it?.kind === 'draw') {
      if (it.snapped) this.drawShapePreview(ctx, this.shapeFromRecognized(it.snapped, it.stroke));
      else this.drawLiveStroke(ctx, it.stroke);
    }
    if (this.remoteLive) this.drawLiveStroke(ctx, this.remoteLive);
    if (it?.kind === 'shape') this.drawShapePreview(ctx, this.shapeFromDrag(it.start, it.end));
    if (it?.kind === 'erase' && it.pieces.size) {
      for (const pieces of it.pieces.values()) for (const el of pieces) drawElement(ctx, el, this.theme);
      this.markLive(unionRects([...it.pieces.values()].flat().map(elementBounds)), 8);
    }
    if (it?.kind === 'polygon') this.drawPolygonPreview(ctx, it);
    if (it?.kind === 'move' || it?.kind === 'scale') {
      for (const el of it.moved) drawElement(ctx, el, this.theme);
      this.markLive(unionRects(it.moved.map(elementBounds)), 12);
    }

    // Selection chrome (screen space for constant-size handles).
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const selBounds = this.interaction?.kind === 'move' || this.interaction?.kind === 'scale'
      ? unionRects(this.interaction.moved.map(elementBounds))
      : this.selectionBounds();
    if (selBounds && ui.get().tool === 'select') this.drawSelection(ctx, selBounds);
    if (it?.kind === 'marquee') {
      const a = worldToScreen(cam, it.start.x, it.start.y), b = worldToScreen(cam, it.end.x, it.end.y);
      const r = rectFromPoints(a.x, a.y, b.x, b.y);
      this.liveRects.push(inflate(r, 2));
      ctx.fillStyle = this.theme.selection + '14';
      ctx.strokeStyle = this.theme.selection;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w, r.h, 4);
      ctx.fill();
      ctx.stroke();
    }

    // Eraser cursor.
    const tool = ui.get().tool;
    if (tool === 'eraser' && this.hover && !this.readOnly) {
      const er = ui.get().eraserSize / 2 + 2;
      this.liveRects.push({ x: this.hover.x - er, y: this.hover.y - er, w: er * 2, h: er * 2 });
      ctx.beginPath();
      ctx.arc(this.hover.x, this.hover.y, ui.get().eraserSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.appearance === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
      ctx.fill();
      ctx.strokeStyle = this.theme.appearance === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Dot tool: a ghost shows where the dot will land (snapped onto a ring when close).
    if (tool === 'dot' && this.hover && !this.readOnly) {
      const at = this.dotPlacement(this.hover);
      const s = worldToScreen(this.camera, at.x, at.y);
      const r = ui.get().dot.size / 2;
      this.liveRects.push({ x: s.x - r - 3, y: s.y - r - 3, w: r * 2 + 6, h: r * 2 + 6 });
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = at.snapped ? 0.6 : 0.35;
      ctx.fillStyle = this.theme.resolve(ui.get().dot.color);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const now = Date.now();
    const a = this.drawLaser(ctx, this.laser, now);
    const b = this.drawLaser(ctx, this.remoteLaser, now);
    if (tool === 'laser' && this.hover && !this.interaction) this.drawLaserDot(ctx, this.hover.x, this.hover.y, 1);
    return a || b;
  }

  private drawLiveStroke(ctx: CanvasRenderingContext2D, s: LiveStroke) {
    const p = s.points;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
    }
    this.markLive(inflate({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, s.size));
    const path = strokePath(s.points, s.tool, s.size, s.pressure, false, s);
    ctx.fillStyle = this.theme.resolve(s.color);
    if (s.tool === 'highlighter') {
      ctx.globalAlpha = HIGHLIGHT_ALPHA;
      if (this.theme.appearance === 'light') ctx.globalCompositeOperation = 'multiply';
    }
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawShapePreview(ctx: CanvasRenderingContext2D, el: BoardElement) {
    this.markLive(elementBounds(el), 4);
    drawElement(ctx, el, this.theme);
  }

  private drawSelection(ctx: CanvasRenderingContext2D, b: Rect) {
    const cam = this.camera;
    const p = worldToScreen(cam, b.x, b.y);
    const r = inflate({ x: p.x, y: p.y, w: b.w * cam.z, h: b.h * cam.z }, 6);
    this.liveRects.push(inflate(r, HANDLE_R + 8));
    ctx.strokeStyle = this.theme.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.stroke();
    ctx.setLineDash([]);
    // Resize handle — 44pt hit area, visually 18px.
    ctx.beginPath();
    ctx.arc(r.x + r.w, r.y + r.h, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawLaserDot(ctx: CanvasRenderingContext2D, sx: number, sy: number, alpha: number) {
    this.liveRects.push({ x: sx - 24, y: sy - 24, w: 48, h: 48 });
    const red = this.theme.resolve('red');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = red;
    ctx.shadowColor = red;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Draw a fading laser trail in screen space. Returns true if still visible. */
  private drawLaser(ctx: CanvasRenderingContext2D, pts: LaserPoint[], now: number): boolean {
    while (pts.length && now - pts[0].t > LASER_LIFETIME) pts.shift();
    if (!pts.length) return false;
    const cam = this.camera;
    const red = this.theme.resolve('red');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = red;
    ctx.shadowColor = red;
    ctx.shadowBlur = 12;
    for (let i = 1; i < pts.length; i++) {
      const life = 1 - (now - pts[i].t) / LASER_LIFETIME;
      const a = worldToScreen(cam, pts[i - 1].x, pts[i - 1].y), b = worldToScreen(cam, pts[i].x, pts[i].y);
      this.liveRects.push(inflate(rectFromPoints(a.x, a.y, b.x, b.y), 20));
      ctx.globalAlpha = Math.max(0, life);
      ctx.lineWidth = 2 + 4 * life;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    const tip = pts[pts.length - 1];
    const s = worldToScreen(cam, tip.x, tip.y);
    this.drawLaserDot(ctx, s.x, s.y, Math.max(0, 1 - (now - tip.t) / LASER_LIFETIME));
    return true;
  }

  // ─── Element factories ─────────────────────────────────────────────

  /** Snap a world point to the page grid when Snap to Grid is on. */
  private snap(p: Vec): Vec {
    if (!ui.get().snapGrid) return p;
    const step = gridStep(this.store.page.background);
    return { x: snapTo(p.x, step), y: snapTo(p.y, step) };
  }

  private shapeFromDrag(a0: Vec, b0: Vec): ShapeElement {
    const st = ui.get().shape;
    const kind = ui.get().shapeKind;
    const a = this.snap(a0);
    let { x: x2, y: y2 } = this.snap(b0);
    if (this.shiftDown) {
      const dx = x2 - a.x, dy = y2 - a.y;
      if (kind === 'line' || kind === 'arrow') {
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        x2 = a.x + Math.cos(ang) * len;
        y2 = a.y + Math.sin(ang) * len;
      } else {
        const s = Math.max(Math.abs(dx), Math.abs(dy));
        x2 = a.x + Math.sign(dx || 1) * s;
        y2 = a.y + Math.sign(dy || 1) * s;
      }
    }
    return { id: uid(), type: 'shape', kind: kind === 'polygon' ? 'rect' : kind, x1: a.x, y1: a.y, x2, y2, color: st.color, size: st.size / this.camera.z, fill: st.fill };
  }

  private polygonElement(pts: Vec[]): ShapeElement {
    const st = ui.get().shape;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
      id: uid(), type: 'shape', kind: 'polygon',
      x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys),
      pts: pts.flatMap((p) => [p.x, p.y]),
      color: st.color, size: st.size / this.camera.z, fill: st.fill,
    };
  }

  private drawPolygonPreview(ctx: CanvasRenderingContext2D, it: Extract<Interaction, { kind: 'polygon' }>) {
    const st = ui.get().shape;
    const pts = [...it.pts, it.cursor];
    const color = this.theme.resolve(st.color);
    ctx.save();
    ctx.lineWidth = st.size / this.camera.z;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    // Closing edge (dashed) and the first vertex as a target.
    ctx.setLineDash([6 / this.camera.z, 6 / this.camera.z]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(it.cursor.x, it.cursor.y);
    ctx.lineTo(it.pts[0].x, it.pts[0].y);
    ctx.stroke();
    ctx.restore();
    const r = 6 / this.camera.z;
    ctx.beginPath();
    ctx.arc(it.pts[0].x, it.pts[0].y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.theme.selection;
    ctx.fill();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    this.markLive({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, 16);
  }

  /** Finish a polygon (3+ vertices), or drop it. */
  private commitPolygon(it: Extract<Interaction, { kind: 'polygon' }>) {
    if (this.interaction === it) this.interaction = null;
    if (it.pts.length >= 3) this.store.addElements([this.polygonElement(it.pts)]);
    this.liveDirty = true;
    this.schedule();
  }

  /** Enter / Escape while drawing a polygon: finish or cancel it. */
  finishPolygon(commit: boolean) {
    const it = this.interaction;
    if (it?.kind !== 'polygon') return false;
    if (commit) this.commitPolygon(it);
    else {
      this.interaction = null;
      this.invalidate();
    }
    return true;
  }

  private shapeFromRecognized(r: Recognized, s: LiveStroke): ShapeElement {
    return { id: uid(), type: 'shape', ...r, color: s.color, size: s.size * 0.55, fill: false };
  }

  // ─── Pointer input ─────────────────────────────────────────────────

  private shiftDown = false;

  private bindEvents() {
    const el = this.live;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('contextmenu', this.preventDefault);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    // Safari trackpad pinch.
    el.addEventListener('gesturestart', this.preventDefault as EventListener);
    el.addEventListener('gesturechange', this.preventDefault as EventListener);
  }

  private unbindEvents() {
    const el = this.live;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerCancel);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('dblclick', this.onDoubleClick);
    el.removeEventListener('contextmenu', this.preventDefault);
    el.removeEventListener('gesturestart', this.preventDefault as EventListener);
    el.removeEventListener('gesturechange', this.preventDefault as EventListener);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }

  private preventDefault = (e: Event) => e.preventDefault();

  private onBlur = () => {
    this.spaceDown = false;
    this.shiftDown = false;
    this.updateCursor();
  };

  private onKey = (e: KeyboardEvent) => {
    this.shiftDown = e.shiftKey;
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (e.code === 'Space' && !typing) {
      const down = e.type === 'keydown';
      if (down !== this.spaceDown) {
        this.spaceDown = down;
        this.updateCursor();
      }
      if (down) e.preventDefault();
    }
    if (this.interaction?.kind === 'shape') {
      this.liveDirty = true;
      this.schedule();
    }
    if (this.interaction?.kind === 'polygon' && e.type === 'keydown' && !typing && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.finishPolygon(e.key === 'Enter');
    }
  };

  updateCursor() {
    const tool = ui.get().tool;
    const panning = this.interaction?.kind === 'pan';
    let cursor = 'default';
    if (this.readOnly) cursor = 'default';
    else if (this.spaceDown || tool === 'hand') cursor = panning ? 'grabbing' : 'grab';
    else if (tool === 'pen' || tool === 'highlighter' || tool === 'shape' || tool === 'dot') cursor = 'crosshair';
    else if (tool === 'eraser' || tool === 'laser') cursor = 'none';
    else if (tool === 'text' || tool === 'note') cursor = 'text';
    this.live.style.cursor = cursor;
    this.liveDirty = true;
    this.schedule();
  }

  private localPoint(e: PointerEvent | WheelEvent | MouseEvent): Vec {
    const r = this.live.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    // Suppress compat mouse events: keeps focus (e.g. a just-opened text
    // editor) from being stolen and stops text selection mid-stroke.
    e.preventDefault();
    const active = document.activeElement;
    const wasEditing = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || (active instanceof HTMLElement && active.isContentEditable);
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    if (e.pointerType === 'pen') this.penSeen = true;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, { ...p, type: e.pointerType });
    try {
      this.live.setPointerCapture(e.pointerId);
    } catch { /* pointer already released (or synthetic) */ }
    this.shiftDown = e.shiftKey;

    // Two fingers → pinch/pan, abandoning whatever the first finger started.
    const touches = [...this.pointers.values()].filter((q) => q.type === 'touch');
    if (e.pointerType === 'touch' && touches.length === 2) {
      if (this.interaction?.kind === 'draw') this.events.onPresence?.({ live: null });
      this.cancelInteraction();
      const [a, b] = touches;
      this.interaction = {
        kind: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        cam: { ...this.camera },
      };
      return;
    }
    const tool = ui.get().tool;
    if (this.interaction?.kind === 'polygon' && tool === 'shape' && ui.get().shapeKind === 'polygon' && !this.spaceDown && e.button === 0) {
      this.addPolygonVertex(p);
      return;
    }
    if (this.interaction) return;

    const world = screenToWorld(this.camera, p.x, p.y);
    const wantsPan =
      this.readOnly || this.spaceDown || tool === 'hand' || e.button === 1 || e.button === 2 ||
      // Palm rejection: once a stylus has been seen, fingers navigate.
      (e.pointerType === 'touch' && this.penSeen);
    if (wantsPan) {
      this.interaction = { kind: 'pan', pointerId: e.pointerId, start: p, cam: { ...this.camera } };
      this.updateCursor();
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    switch (tool) {
      case 'pen':
      case 'highlighter': {
        const st = ui.get();
        const style = st[tool];
        const uniform = tool === 'pen' && !st.penPressure;
        const pressure = e.pointerType === 'pen' && !uniform;
        const size = style.size / this.camera.z;
        const stroke: LiveStroke = { tool, points: [world.x, world.y, pressure ? e.pressure || 0.5 : 0.5], color: style.color, size, pressure };
        if (tool === 'pen' && Math.abs(st.penSmoothing - 0.5) > 0.001) stroke.smoothing = st.penSmoothing;
        if (uniform) stroke.uniform = true;
        this.interaction = { kind: 'draw', pointerId: e.pointerId, stroke, minDist: 0.6 / this.camera.z, holdAt: p, holdTimer: 0, snapped: null };
        this.armHold();
        break;
      }
      case 'eraser': {
        this.interaction = { kind: 'erase', pointerId: e.pointerId, last: world, erased: new Set(), pieces: new Map() };
        this.eraseAlong(world, world);
        break;
      }
      case 'laser':
        this.interaction = { kind: 'laser', pointerId: e.pointerId };
        this.laser.push({ ...world, t: Date.now() });
        break;
      case 'shape':
        if (ui.get().shapeKind === 'polygon') {
          const v = this.snap(world);
          this.interaction = { kind: 'polygon', pts: [v], cursor: v };
          ui.set({ toast: null });
        } else this.interaction = { kind: 'shape', pointerId: e.pointerId, start: world, end: world };
        break;
      case 'text':
      case 'note': {
        // A tap that ends an edit only ends the edit (Apple Notes behaviour).
        if (wasEditing) break;
        const hit = this.hitTop(world, 4 / this.camera.z);
        const at = this.snap(world);
        if (hit?.type === 'text') {
          this.events.onEditText?.({ element: hit, isNew: false });
        } else if (tool === 'note') {
          const w = 220 / this.camera.z;
          if (ui.get().snapGrid) {
            world.x = at.x + w / 2;
            world.y = at.y + w / 2;
          }
          const st = ui.get();
          this.events.onEditText?.({
            isNew: true,
            element: { id: uid(), type: 'text', x: world.x - w / 2, y: world.y - w / 2, text: '', color: 'label', fontSize: 20 / this.camera.z, note: { w, h: w, tint: st.noteTint } },
          });
        } else {
          const st = ui.get().text;
          const fontSize = st.size / this.camera.z;
          this.events.onEditText?.({
            isNew: true,
            element: { id: uid(), type: 'text', x: ui.get().snapGrid ? at.x : world.x, y: ui.get().snapGrid ? at.y : world.y - fontSize * 0.65, text: '', color: st.color, fontSize },
          });
        }
        break;
      }
      case 'dot': {
        const st = ui.get().dot;
        const at = this.dotPlacement(p);
        this.store.addElements([{ id: uid(), type: 'dot', x: at.x, y: at.y, r: st.size / 2 / this.camera.z, color: st.color }]);
        break;
      }
      case 'select':
        this.beginSelect(e, p, world);
        break;
    }
    this.liveDirty = true;
    this.schedule();
  };

  private beginSelect(e: PointerEvent, p: Vec, world: Vec) {
    const sel = ui.get().selection;
    const bounds = this.selectionBounds();
    const page = this.store.page;
    if (bounds) {
      const cam = this.camera;
      const s = worldToScreen(cam, bounds.x + bounds.w, bounds.y + bounds.h);
      // Handle sits at the inflated corner (6px padding).
      if (Math.hypot(p.x - (s.x + 6), p.y - (s.y + 6)) <= 22) {
        const originals = page.elements.filter((el) => sel.has(el.id));
        const origin = { x: bounds.x, y: bounds.y };
        this.interaction = { kind: 'scale', pointerId: e.pointerId, origin, startDist: Math.hypot(world.x - origin.x, world.y - origin.y) || 1, originals, moved: originals };
        this.setHidden(sel);
        return;
      }
    }
    const hit = this.hitTop(world, 6 / this.camera.z);
    // ⌘-click follows a link in text.
    if (hit?.type === 'text' && (e.metaKey || e.ctrlKey)) {
      const href = linkAt(hit, world);
      if (href) {
        window.open(href, '_blank', 'noopener');
        return;
      }
    }
    let next = sel;
    if (hit) {
      const unit = expandGroups(page.elements, [hit.id]);
      if (e.shiftKey) {
        const toggled = new Set(sel);
        const on = toggled.has(hit.id);
        for (const id of unit) on ? toggled.delete(id) : toggled.add(id);
        next = toggled;
      } else if (!sel.has(hit.id)) next = unit;
    } else if (bounds && pointInRect(world, inflate(bounds, 6 / this.camera.z)) && !e.shiftKey) {
      // Dragging inside the selection box moves it.
    } else {
      this.interaction = { kind: 'marquee', pointerId: e.pointerId, start: world, end: world, additive: e.shiftKey };
      if (!e.shiftKey) ui.set({ selection: new Set() });
      return;
    }
    if (next !== sel) ui.set({ selection: next });
    const originals = page.elements.filter((el) => next.has(el.id) && !el.locked);
    if (originals.length) {
      this.interaction = { kind: 'move', pointerId: e.pointerId, start: world, originals, moved: originals, dragged: false };
    }
  }

  private addPolygonVertex(p: Vec) {
    const it = this.interaction;
    if (it?.kind !== 'polygon') return;
    const v = this.snap(screenToWorld(this.camera, p.x, p.y));
    const first = worldToScreen(this.camera, it.pts[0].x, it.pts[0].y);
    const last = worldToScreen(this.camera, it.pts[it.pts.length - 1].x, it.pts[it.pts.length - 1].y);
    // Tap the first vertex, or tap twice in place, to close the shape.
    if (it.pts.length >= 3 && (Math.hypot(p.x - first.x, p.y - first.y) < 14 || Math.hypot(p.x - last.x, p.y - last.y) < 6)) {
      this.commitPolygon(it);
      return;
    }
    if (Math.hypot(p.x - last.x, p.y - last.y) < 6) return;
    it.pts.push(v);
    it.cursor = v;
    this.liveDirty = true;
    this.schedule();
  }

  /** World position for a dot placed at screen point `p`. */
  private dotPlacement(p: Vec): Vec & { snapped: boolean } {
    const world = screenToWorld(this.camera, p.x, p.y);
    if (!ui.get().snapDots) return { ...world, snapped: false };
    return snapToRing(this.store.page.elements, world, 16 / this.camera.z);
  }

  private hitTop(world: Vec, r: number, includeLocked = false): BoardElement | null {
    const els = this.store.page.elements;
    for (let i = els.length - 1; i >= 0; i--) if ((includeLocked || !els[i].locked) && hitTestPoint(els[i], world, r)) return els[i];
    return null;
  }

  private armHold() {
    const it = this.interaction;
    if (it?.kind !== 'draw' || !ui.get().snapShapes) return;
    clearTimeout(it.holdTimer);
    it.holdTimer = window.setTimeout(() => {
      if (this.interaction !== it || it.snapped) return;
      const r = recognize(it.stroke.points);
      if (!r) return;
      if (it.stroke.tool === 'highlighter') {
        if (r.kind !== 'line') return;
        // Straighten the highlight instead of converting it.
        const n = 12;
        const pts: number[] = [];
        for (let i = 0; i <= n; i++) pts.push(r.x1 + ((r.x2 - r.x1) * i) / n, r.y1 + ((r.y2 - r.y1) * i) / n, 0.5);
        it.stroke.points = pts;
      } else {
        it.snapped = r;
      }
      navigator.vibrate?.(8);
      this.events.onPresence?.({ live: it.snapped ? null : it.stroke });
      this.liveDirty = true;
      this.schedule();
    }, HOLD_TO_SNAP_MS);
  }

  private onPointerMove = (e: PointerEvent) => {
    const p = this.localPoint(e);
    const tracked = this.pointers.get(e.pointerId);
    if (tracked) {
      tracked.x = p.x;
      tracked.y = p.y;
    }
    this.hover = e.pointerType === 'touch' ? null : p;
    const it = this.interaction;
    const tool = ui.get().tool;

    if (it?.kind === 'polygon') {
      it.cursor = this.snap(screenToWorld(this.camera, p.x, p.y));
      this.liveDirty = true;
      this.schedule();
      return;
    }
    if (!it) {
      if (tool === 'eraser' || tool === 'laser' || tool === 'dot') {
        this.liveDirty = true;
        this.schedule();
      }
      return;
    }

    if (it.kind === 'pinch') {
      const touches = [...this.pointers.values()].filter((q) => q.type === 'touch');
      if (touches.length < 2) return;
      const [a, b] = touches;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(it.cam, it.startMid.x, it.startMid.y, it.cam.z * (dist / it.startDist));
      this.store.setCamera({ ...zoomed, x: zoomed.x - (mid.x - it.startMid.x) / zoomed.z, y: zoomed.y - (mid.y - it.startMid.y) / zoomed.z });
      return;
    }
    if ('pointerId' in it && it.pointerId !== e.pointerId) return;

    const cam = this.camera;
    switch (it.kind) {
      case 'pan': {
        this.store.setCamera({ ...it.cam, x: it.cam.x - (p.x - it.start.x) / it.cam.z, y: it.cam.y - (p.y - it.start.y) / it.cam.z });
        return;
      }
      case 'draw': {
        if (it.snapped) return;
        const pts = it.stroke.points;
        // Coalesced events recover the full-rate digitizer samples (120–240Hz).
        const samples = e.getCoalescedEvents?.() ?? [e];
        const rect = this.live.getBoundingClientRect();
        for (const s of samples.length ? samples : [e]) {
          const w = screenToWorld(cam, s.clientX - rect.left, s.clientY - rect.top);
          const lx = pts[pts.length - 3], ly = pts[pts.length - 2];
          if (Math.abs(w.x - lx) + Math.abs(w.y - ly) < it.minDist) continue;
          pts.push(w.x, w.y, it.stroke.pressure ? s.pressure || 0.5 : 0.5);
        }
        if (Math.hypot(p.x - it.holdAt.x, p.y - it.holdAt.y) > 3) {
          it.holdAt = p;
          this.armHold();
        }
        this.events.onPresence?.({ live: it.stroke });
        break;
      }
      case 'erase': {
        const w = screenToWorld(cam, p.x, p.y);
        this.eraseAlong(it.last, w);
        it.last = w;
        break;
      }
      case 'laser': {
        const now = Date.now();
        for (const s of e.getCoalescedEvents?.() ?? [e]) {
          const r = this.live.getBoundingClientRect();
          this.laser.push({ ...screenToWorld(cam, s.clientX - r.left, s.clientY - r.top), t: now });
        }
        this.events.onPresence?.({ laser: this.laser });
        break;
      }
      case 'shape':
        it.end = screenToWorld(cam, p.x, p.y);
        this.shiftDown = e.shiftKey;
        break;
      case 'move': {
        const w = screenToWorld(cam, p.x, p.y);
        const dx = w.x - it.start.x, dy = w.y - it.start.y;
        if (!it.dragged && Math.hypot(dx * cam.z, dy * cam.z) < 3) return;
        if (!it.dragged) {
          it.dragged = true;
          this.setHidden(it.originals.map((o) => o.id));
        }
        let sdx = dx, sdy = dy;
        if (ui.get().snapGrid) {
          // Snap the selection's top-left corner to the grid.
          const b = unionRects(it.originals.map(elementBounds))!;
          const step = gridStep(this.store.page.background);
          sdx = snapTo(b.x + dx, step) - b.x;
          sdy = snapTo(b.y + dy, step) - b.y;
        }
        it.moved = it.originals.map((o) => translateElement(o, sdx, sdy));
        break;
      }
      case 'scale': {
        const w = screenToWorld(cam, p.x, p.y);
        const s = Math.max(0.05, Math.hypot(w.x - it.origin.x, w.y - it.origin.y) / it.startDist);
        it.moved = it.originals.map((o) => scaleElement(o, it.origin.x, it.origin.y, s));
        break;
      }
      case 'marquee':
        it.end = screenToWorld(cam, p.x, p.y);
        break;
    }
    this.liveDirty = true;
    this.schedule();
  };

  private eraseAlong(a: Vec, b: Vec) {
    const it = this.interaction;
    if (it?.kind !== 'erase') return;
    const r = ui.get().eraserSize / 2 / this.camera.z;
    const segment = ui.get().eraserMode === 'segment';
    let changed = false;
    for (const el of this.store.page.elements) {
      if (el.locked) continue;
      if (segment && el.type === 'stroke') {
        // Partial erase: cut the touched part out, keep the rest as pieces.
        const current = it.pieces.get(el.id) ?? [el];
        let touched = false;
        const next: BoardElement[] = [];
        for (const piece of current) {
          const cut = piece.type === 'stroke' ? eraseStrokeSegment(piece, a.x, a.y, b.x, b.y, r) : null;
          if (cut) touched = true;
          next.push(...(cut ?? [piece]));
        }
        if (touched) {
          it.pieces.set(el.id, next);
          if (!it.erased.has(el.id)) {
            it.erased.add(el.id);
            changed = true;
          }
          this.liveDirty = true;
        }
        continue;
      }
      if (it.erased.has(el.id)) continue;
      if (hitTestSegment(el, a.x, a.y, b.x, b.y, r)) {
        it.erased.add(el.id);
        changed = true;
      }
    }
    if (changed) this.updateHidden(new Set(it.erased));
  }

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const it = this.interaction;
    if (!it) return;
    if (it.kind === 'pinch') {
      if (this.pointers.size < 2) this.interaction = null;
      return;
    }
    if (it.kind === 'polygon') return;
    if (it.pointerId !== e.pointerId) return;
    this.interaction = null;

    switch (it.kind) {
      case 'draw': {
        clearTimeout(it.holdTimer);
        const s = it.stroke;
        if (it.snapped) {
          this.store.addElements([this.shapeFromRecognized(it.snapped, s)]);
          toast('Shape snapped');
        } else {
          const el: StrokeElement = { id: uid(), type: 'stroke', tool: s.tool, points: this.optimize(s), color: s.color, size: s.size, pressure: s.pressure };
          if (s.smoothing !== undefined) el.smoothing = s.smoothing;
          if (s.uniform) el.uniform = true;
          this.store.addElements([el]);
        }
        this.events.onPresence?.({ live: null });
        break;
      }
      case 'erase': {
        if (it.pieces.size) {
          const pieces = new Map<string, BoardElement[]>();
          for (const id of it.erased) pieces.set(id, it.pieces.get(id) ?? []);
          this.store.commit(replaceWithPieces(this.store.page.id, this.store.page.elements, pieces));
        } else if (it.erased.size) this.store.removeElements(it.erased);
        this.updateHidden(new Set());
        break;
      }
      case 'shape': {
        const el = this.shapeFromDrag(it.start, it.end);
        const b = elementBounds(el);
        if (b.w * this.camera.z > 6 || b.h * this.camera.z > 6) this.store.addElements([el]);
        break;
      }
      case 'move':
      case 'scale':
        if (it.kind === 'scale' || it.dragged) this.store.replaceElements(it.moved);
        this.updateHidden(new Set());
        break;
      case 'marquee': {
        const r = rectFromPoints(it.start.x, it.start.y, it.end.x, it.end.y);
        const ids = new Set(it.additive ? ui.get().selection : []);
        if (r.w > 0 || r.h > 0) {
          for (const el of this.store.page.elements) if (!el.locked && rectsIntersect(elementBounds(el), r)) ids.add(el.id);
        }
        ui.set({ selection: expandGroups(this.store.page.elements, ids) });
        break;
      }
      case 'pan':
        this.updateCursor();
        break;
      case 'laser':
        break;
    }
    this.liveDirty = true;
    this.schedule();
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.interaction && (!('pointerId' in this.interaction) || this.interaction.pointerId === e.pointerId)) {
      this.cancelInteraction();
    }
  };

  private onPointerLeave = () => {
    this.hover = null;
    this.liveDirty = true;
    this.schedule();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.localPoint(e);
    const cam = this.camera;
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel; mouse wheel with ⌘ too.
      const factor = Math.exp((-e.deltaY * scale) / (e.ctrlKey && !e.metaKey ? 100 : 400));
      this.store.setCamera(zoomAt(cam, p.x, p.y, cam.z * factor));
    } else {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      this.store.setCamera({ ...cam, x: cam.x + (dx * scale) / cam.z, y: cam.y + (dy * scale) / cam.z });
    }
  };

  private onDoubleClick = (e: MouseEvent) => {
    if (this.readOnly) return;
    const tool = ui.get().tool;
    if (tool !== 'select') return;
    const p = this.localPoint(e);
    const world = screenToWorld(this.camera, p.x, p.y);
    const hit = this.hitTop(world, 4 / this.camera.z);
    if (hit?.type === 'text') this.events.onEditText?.({ element: hit, isNew: false });
    else if (hit?.type === 'equation') openEquation(hit.id);
    else if (hit?.groupId) {
      // Double-click into a group selects just that member.
      ui.set({ selection: new Set([hit.id]) });
      this.invalidate();
    } else if (!hit) {
      // Locked elements can still be selected deliberately (to unlock them).
      const locked = this.hitTop(world, 4 / this.camera.z, true);
      if (locked) ui.set({ selection: new Set([locked.id]) });
    }
  };

  /**
   * Vector stroke optimization: pressure-true and constant-width strokes
   * drop samples that don't change their shape; all strokes are rounded.
   * (Simulated pressure depends on sample spacing, so those keep every sample.)
   */
  private optimize(s: LiveStroke): number[] {
    const tol = 0.15 / this.camera.z;
    if (s.pressure || s.uniform || s.tool === 'highlighter') return optimizePoints(s.points, tol);
    return s.points.map((v, i) => (i % 3 === 2 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100));
  }
}
