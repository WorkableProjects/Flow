import { uid } from './geometry';
import { normalizeSpans, textFields } from './richtext';
import type { Background, BoardElement, Camera, FlowDocument, Page } from './types';

// ─── Operations (the unit of undo/redo and of sync) ──────────────────

interface Placed {
  index: number;
  el: BoardElement;
}

export type Op =
  | { kind: 'elements'; pageId: string; removed: Placed[]; added: Placed[] }
  | { kind: 'page'; action: 'insert' | 'delete'; index: number; page: Page }
  | { kind: 'pageProps'; pageId: string; before: PageProps; after: PageProps }
  | { kind: 'title'; before: string; after: string }
  | { kind: 'movePage'; from: number; to: number }
  /** Several ops undone and redone as one step (e.g. align, group, split erase). */
  | { kind: 'batch'; ops: Op[] };

type PageProps = Partial<Pick<Page, 'name' | 'background'>>;

export type Change =
  | { type: 'op'; op: Op; source: 'local' | 'remote' | 'history'; appendOnly: boolean }
  | { type: 'camera'; pageId: string }
  | { type: 'activePage' }
  | { type: 'replace' };

type Listener = (change: Change) => void;

export function invert(op: Op): Op {
  switch (op.kind) {
    case 'elements':
      return { ...op, removed: op.added, added: op.removed };
    case 'page':
      return { ...op, action: op.action === 'insert' ? 'delete' : 'insert' };
    case 'pageProps':
      return { ...op, before: op.after, after: op.before };
    case 'title':
      return { ...op, before: op.after, after: op.before };
    case 'movePage':
      return { kind: 'movePage', from: op.to, to: op.from };
    case 'batch':
      return { kind: 'batch', ops: op.ops.map(invert).reverse() };
  }
}

/** The page an op touches, if it touches exactly one. */
export function opPageId(op: Op): string | null {
  if (op.kind === 'elements' || op.kind === 'pageProps') return op.pageId;
  if (op.kind === 'batch') {
    for (const o of op.ops) {
      const id = opPageId(o);
      if (id) return id;
    }
  }
  return null;
}

// ─── Document factories ───────────────────────────────────────────────

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };

export function createPage(name: string, background: Background = 'dots'): Page {
  return { id: uid(), name, background, elements: [], camera: { ...DEFAULT_CAMERA } };
}

export function createDocument(): FlowDocument {
  const page = createPage('Page 1');
  return { version: 1, id: uid(), title: 'Untitled Lesson', pages: [page], activePage: page.id, updatedAt: Date.now() };
}

/**
 * Clean untrusted content in place: rich text marks (only safe links),
 * paragraph styles, and missing fields from older versions.
 */
export function sanitizeDocument(doc: FlowDocument): FlowDocument {
  for (const page of doc.pages) {
    page.elements = page.elements.filter((el) => el && typeof el.id === 'string' && typeof el.type === 'string').map((el) => {
      if (el.type !== 'text') return el;
      const text = typeof el.text === 'string' ? el.text : '';
      const spans = Array.isArray(el.spans) ? normalizeSpans(el.spans.filter((s) => s && typeof s.text === 'string')) : [{ text }];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { spans: _s, paras: _p, ...rest } = el;
      return { ...rest, ...textFields(spans, Array.isArray(el.paras) ? el.paras : undefined) };
    });
  }
  return doc;
}

/** Structural validation for documents coming from files, storage or peers. */
export function isFlowDocument(v: unknown): v is FlowDocument {
  const d = v as FlowDocument;
  return (
    !!d && d.version === 1 && typeof d.title === 'string' && Array.isArray(d.pages) && d.pages.length > 0 &&
    d.pages.every((p) => typeof p.id === 'string' && Array.isArray(p.elements) && !!p.camera)
  );
}

// ─── Store ────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 200;

export class BoardStore {
  doc: FlowDocument;
  /** Bumped on every change; lets React subscribe cheaply. */
  version = 0;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private listeners = new Set<Listener>();
  /** Ops collected by an open `transaction`. */
  private batching: Op[] | null = null;

  constructor(doc: FlowDocument = createDocument()) {
    this.doc = doc;
  }

  // Subscription ------------------------------------------------------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(change: Change) {
    this.version++;
    if (change.type !== 'camera') this.doc.updatedAt = Date.now();
    for (const fn of this.listeners) fn(change);
  }

  // Accessors ---------------------------------------------------------

  get page(): Page {
    return this.doc.pages.find((p) => p.id === this.doc.activePage) ?? this.doc.pages[0];
  }

  pageById(id: string): Page | undefined {
    return this.doc.pages.find((p) => p.id === id);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  // Core op application ---------------------------------------------

  private applyOp(op: Op): boolean {
    switch (op.kind) {
      case 'elements': {
        const page = this.pageById(op.pageId);
        if (!page) return false;
        const els = page.elements.slice();
        // Remove from the highest index down so earlier indices stay valid.
        const removed = [...op.removed].sort((a, b) => b.index - a.index);
        for (const r of removed) {
          const at = els[r.index]?.id === r.el.id ? r.index : els.findIndex((e) => e.id === r.el.id);
          if (at >= 0) els.splice(at, 1);
        }
        const added = [...op.added].sort((a, b) => a.index - b.index);
        for (const a of added) els.splice(Math.min(a.index, els.length), 0, a.el);
        page.elements = els;
        return true;
      }
      case 'page': {
        if (op.action === 'insert') {
          this.doc.pages.splice(Math.min(op.index, this.doc.pages.length), 0, op.page);
        } else {
          if (this.doc.pages.length <= 1) return false;
          const at = this.doc.pages.findIndex((p) => p.id === op.page.id);
          if (at < 0) return false;
          this.doc.pages.splice(at, 1);
          if (this.doc.activePage === op.page.id) {
            this.doc.activePage = this.doc.pages[Math.max(0, at - 1)].id;
          }
        }
        this.doc.pages = [...this.doc.pages];
        return true;
      }
      case 'pageProps': {
        const page = this.pageById(op.pageId);
        if (!page) return false;
        Object.assign(page, op.after);
        this.doc.pages = this.doc.pages.map((p) => (p.id === page.id ? { ...page } : p));
        return true;
      }
      case 'title':
        this.doc.title = op.after;
        return true;
      case 'movePage': {
        const pages = this.doc.pages.slice();
        if (op.from < 0 || op.from >= pages.length || op.to < 0 || op.to >= pages.length) return false;
        const [p] = pages.splice(op.from, 1);
        pages.splice(op.to, 0, p);
        this.doc.pages = pages;
        return true;
      }
      case 'batch': {
        let any = false;
        for (const o of op.ops) any = this.applyOp(o) || any;
        return any;
      }
    }
  }

  private static isAppendOnly(op: Op, page?: Page) {
    return (
      op.kind === 'elements' && op.removed.length === 0 && !!page &&
      op.added.every((a) => a.index >= page.elements.length - op.added.length)
    );
  }

  /**
   * Run `fn`, folding every commit it makes into a single undo step.
   * Listeners still hear each op as it happens.
   */
  transaction(fn: () => void) {
    if (this.batching) return fn();
    this.batching = [];
    try {
      fn();
    } finally {
      const ops = this.batching;
      this.batching = null;
      if (ops.length) {
        this.undoStack.push(ops.length === 1 ? ops[0] : { kind: 'batch', ops });
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
        this.redoStack = [];
        this.version++;
        for (const l of this.listeners) l({ type: 'op', op: { kind: 'batch', ops: [] }, source: 'history', appendOnly: false });
      }
    }
  }

  /** Apply an op, record it for undo, and notify listeners. */
  commit(op: Op) {
    if (!this.applyOp(op)) return;
    if (this.batching) {
      this.batching.push(op);
      const page = op.kind === 'elements' ? this.pageById(op.pageId) : undefined;
      this.emit({ type: 'op', op, source: 'local', appendOnly: BoardStore.isAppendOnly(op, page) });
      return;
    }
    this.undoStack.push(op);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    const page = op.kind === 'elements' ? this.pageById(op.pageId) : undefined;
    this.emit({ type: 'op', op, source: 'local', appendOnly: BoardStore.isAppendOnly(op, page) });
  }

  /** Apply an op received from a peer (not recorded in local history). */
  applyRemote(op: Op) {
    if (!this.applyOp(op)) return;
    const page = op.kind === 'elements' ? this.pageById(op.pageId) : undefined;
    this.emit({ type: 'op', op, source: 'remote', appendOnly: BoardStore.isAppendOnly(op, page) });
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    const inv = invert(op);
    this.applyOp(inv);
    this.redoStack.push(op);
    this.focusOpPage(op);
    this.emit({ type: 'op', op: inv, source: 'history', appendOnly: false });
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    this.applyOp(op);
    this.undoStack.push(op);
    this.focusOpPage(op);
    this.emit({ type: 'op', op, source: 'history', appendOnly: false });
  }

  /** Undoing on another page would be invisible — switch to it first. */
  private focusOpPage(op: Op) {
    const id = opPageId(op);
    if (id && id !== this.doc.activePage && this.pageById(id)) {
      this.doc.activePage = id;
      this.emit({ type: 'activePage' });
    }
  }

  // Element helpers ---------------------------------------------------

  addElements(els: BoardElement[], pageId = this.page.id) {
    if (!els.length) return;
    const page = this.pageById(pageId);
    if (!page) return;
    const base = page.elements.length;
    this.commit({ kind: 'elements', pageId, removed: [], added: els.map((el, i) => ({ index: base + i, el })) });
  }

  removeElements(ids: Iterable<string>, pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page) return;
    const set = new Set(ids);
    const removed: Placed[] = [];
    page.elements.forEach((el, index) => set.has(el.id) && removed.push({ index, el }));
    if (removed.length) this.commit({ kind: 'elements', pageId, removed, added: [] });
  }

  /** Replace elements in place (same z-order), e.g. after move/resize/edit. */
  replaceElements(next: BoardElement[], pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page || !next.length) return;
    const byId = new Map(next.map((e) => [e.id, e]));
    const removed: Placed[] = [];
    const added: Placed[] = [];
    page.elements.forEach((el, index) => {
      const n = byId.get(el.id);
      if (n && n !== el) {
        removed.push({ index, el });
        added.push({ index, el: n });
      }
    });
    if (removed.length) this.commit({ kind: 'elements', pageId, removed, added });
  }

  // Page helpers --------------------------------------------------------

  setActivePage(id: string) {
    if (id === this.doc.activePage || !this.pageById(id)) return;
    this.doc.activePage = id;
    this.emit({ type: 'activePage' });
  }

  addPage(background?: Background) {
    const index = this.doc.pages.findIndex((p) => p.id === this.doc.activePage) + 1;
    const page = createPage(`Page ${this.doc.pages.length + 1}`, background ?? this.page.background);
    this.commit({ kind: 'page', action: 'insert', index, page });
    this.setActivePage(page.id);
  }

  duplicatePage(id = this.page.id) {
    const src = this.pageById(id);
    if (!src) return;
    const index = this.doc.pages.indexOf(src) + 1;
    const page: Page = {
      ...src,
      id: uid(),
      name: `${src.name} copy`,
      elements: src.elements.map((e) => ({ ...e, id: uid() })),
      camera: { ...src.camera },
    };
    this.commit({ kind: 'page', action: 'insert', index, page });
    this.setActivePage(page.id);
  }

  deletePage(id = this.page.id) {
    const index = this.doc.pages.findIndex((p) => p.id === id);
    if (index < 0 || this.doc.pages.length <= 1) return;
    this.commit({ kind: 'page', action: 'delete', index, page: this.doc.pages[index] });
  }

  movePage(id: string, delta: number) {
    const from = this.doc.pages.findIndex((p) => p.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= this.doc.pages.length) return;
    this.commit({ kind: 'movePage', from, to });
  }

  setPageProps(props: PageProps, pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page) return;
    const before: PageProps = {};
    for (const k of Object.keys(props) as (keyof PageProps)[]) (before as Record<string, unknown>)[k] = page[k];
    this.commit({ kind: 'pageProps', pageId, before, after: props });
  }

  setTitle(title: string) {
    if (title === this.doc.title) return;
    this.commit({ kind: 'title', before: this.doc.title, after: title });
  }

  // Camera (not part of history) ------------------------------------

  setCamera(cam: Camera, pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page) return;
    page.camera = cam;
    this.emit({ type: 'camera', pageId });
  }

  // Whole-document replacement --------------------------------------

  load(doc: FlowDocument) {
    this.doc = sanitizeDocument(doc);
    if (!this.pageById(doc.activePage)) doc.activePage = doc.pages[0].id;
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ type: 'replace' });
  }
}
