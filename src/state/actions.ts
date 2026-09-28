import { getController } from '../canvas/instance';
import { alignUnits, distributeUnits, groupElements, orderOp, reorder, selectionUnits, ungroupElements, type AlignMode, type LayerMove } from '../engine/arrange';
import { pageToJpeg, pageToPng } from '../engine/export';
import { buildPdf, dataUrlBytes } from '../engine/pdf';
import { pageToSvg } from '../engine/svg';
import { createPage } from '../engine/store';
import { elementBounds, translateElement, uid, unionRects } from '../engine/geometry';
import { downloadBlob, exportDocument, listLessons, readImageFile, safeFilename } from '../engine/persistence';
import { boardTheme, type Appearance } from '../engine/theme';
import type { BoardElement } from '../engine/types';
import { board } from './board';
import { closeCurrent, importLesson, newLesson } from './lessons';
import { toast, ui } from './ui';

const selected = () => {
  const sel = ui.get().selection;
  return board.page.elements.filter((e) => sel.has(e.id));
};

export const undo = () => board.undo();
export const redo = () => board.redo();

export function deleteSelection() {
  const sel = ui.get().selection;
  if (!sel.size) return;
  board.removeElements(sel);
  ui.set({ selection: new Set() });
}

function withNewIds(els: BoardElement[], dx: number, dy: number) {
  return els.map((e) => ({ ...translateElement(e, dx, dy), id: uid() }));
}

export function duplicateSelection() {
  const els = selected();
  if (!els.length) return;
  const z = board.page.camera.z;
  const copies = withNewIds(els, 24 / z, 24 / z);
  board.addElements(copies);
  ui.set({ selection: new Set(copies.map((c) => c.id)) });
}

/** Z-order: to front/back, or one step forward/backward. One undoable op. */
export function reorderSelection(move: LayerMove | boolean) {
  const m: LayerMove = move === true ? 'front' : move === false ? 'back' : move;
  const sel = ui.get().selection;
  if (!sel.size) return;
  const page = board.page;
  const after = reorder(page.elements, sel, m);
  const op = orderOp(page.id, page.elements, after);
  if (op.removed.length) board.commit(op);
}

// ─── Arrange ──────────────────────────────────────────────────────────

export function alignSelection(mode: AlignMode) {
  const moved = alignUnits(selectionUnits(board.page.elements, ui.get().selection), mode);
  if (moved.length) board.replaceElements(moved);
}

export function distributeSelection(axis: 'x' | 'y') {
  const moved = distributeUnits(selectionUnits(board.page.elements, ui.get().selection), axis);
  if (moved.length) board.replaceElements(moved);
}

export function groupSelection() {
  const els = selected();
  if (els.length < 2) return;
  board.replaceElements(groupElements(els));
  toast('Grouped');
}

export function ungroupSelection() {
  const els = selected().filter((e) => e.groupId);
  if (!els.length) return;
  board.replaceElements(ungroupElements(els));
  toast('Ungrouped');
}

export function setLocked(locked: boolean) {
  const els = selected();
  if (!els.length) return;
  board.replaceElements(els.map((e) => {
    if (locked) return { ...e, locked: true };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { locked: _l, ...rest } = e;
    return rest as BoardElement;
  }));
  if (locked) ui.set({ selection: new Set() });
  toast(locked ? 'Locked — double-click to select it again' : 'Unlocked');
}

// ─── Equations & images: rotate, reflect, annotate ───────────────────

type Boxed = Extract<BoardElement, { type: 'equation' | 'image' }>;
const boxed = () => selected().filter((e): e is Boxed => e.type === 'equation' || e.type === 'image');

export function rotateSelection(deg = 90) {
  const els = boxed();
  if (!els.length) return;
  board.replaceElements(els.map((e) => ({ ...e, rotation: (((e.rotation ?? 0) + deg) % 360 + 360) % 360 })));
}

/** Reflect across the vertical (x) or horizontal (y) axis, as seen on screen. */
export function flipSelection(axis: 'x' | 'y') {
  const els = boxed();
  if (!els.length) return;
  // Mirror ∘ Rotate(θ) = Rotate(−θ) ∘ Mirror, so the angle flips sign and the local flag toggles.
  board.replaceElements(els.map((e) => {
    const rotation = e.rotation ? (360 - e.rotation) % 360 : e.rotation;
    return axis === 'x' ? { ...e, flipX: !e.flipX, rotation } : { ...e, flipY: !e.flipY, rotation };
  }));
}

/** Add a note under an equation, grouped with it, and start typing it. */
export function annotateEquation(id: string) {
  const eq = board.page.elements.find((e) => e.id === id);
  if (!eq || eq.type !== 'equation') return;
  const b = elementBounds(eq);
  const z = board.page.camera.z;
  const group = eq.groupId ?? uid();
  const fontSize = Math.max(14, ui.get().text.size * 0.7) / z;
  const note: BoardElement = { id: uid(), type: 'text', x: b.x, y: b.y + b.h + 10 / z, text: '', color: 'blue', fontSize, groupId: group };
  if (!eq.groupId) board.replaceElements([{ ...eq, groupId: group }]);
  getController()?.editText(note as Extract<BoardElement, { type: 'text' }>, true);
}

export async function copyMathML(id: string) {
  const eq = board.page.elements.find((e) => e.id === id);
  if (!eq || eq.type !== 'equation') return;
  try {
    const { toMathML } = await import('../engine/latex');
    const xml = await toMathML(eq.latex, eq.mode);
    await navigator.clipboard.writeText(xml);
    toast('MathML copied');
  } catch {
    toast('Couldn’t copy MathML');
  }
}

/** Arrow keys: nudge the selection 1 pt (10 with ⇧), in screen points. */
export function nudgeSelection(dx: number, dy: number) {
  const els = selected().filter((e) => !e.locked);
  if (!els.length) return;
  const z = board.page.camera.z;
  board.replaceElements(els.map((e) => translateElement(e, dx / z, dy / z)));
}

/** Eraser › Clear Page: removes everything that isn't locked (undoable). */
export function clearPage() {
  const ids = board.page.elements.filter((e) => !e.locked).map((e) => e.id);
  if (!ids.length) return;
  board.removeElements(ids);
  ui.set({ selection: new Set() });
  toast('Page cleared — ⌘Z to undo');
}

export function selectAll() {
  ui.set({ tool: 'select', selection: new Set(board.page.elements.map((e) => e.id)) });
}

// ─── Clipboard ────────────────────────────────────────────────────────

const CLIP_MIME = 'flow/elements';
let clipboard: BoardElement[] = [];

export function copySelection(e?: ClipboardEvent) {
  const els = selected();
  if (!els.length) return false;
  clipboard = els;
  e?.clipboardData?.setData('text/plain', JSON.stringify({ [CLIP_MIME]: els }));
  e?.preventDefault();
  return true;
}

export function cutSelection(e?: ClipboardEvent) {
  if (copySelection(e)) deleteSelection();
}

function pasteElements(els: BoardElement[]) {
  const r = unionRects(els.map(elementBounds));
  const c = getController()?.worldCenter();
  if (!r || !c) return;
  const copies = withNewIds(els, c.x - (r.x + r.w / 2), c.y - (r.y + r.h / 2));
  board.addElements(copies);
  ui.set({ tool: 'select', selection: new Set(copies.map((x) => x.id)) });
}

export async function handlePaste(e: ClipboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  const dt = e.clipboardData;
  if (!dt) return;
  const file = [...dt.files].find((f) => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    await insertImage(file);
    return;
  }
  const text = dt.getData('text/plain');
  if (text) {
    e.preventDefault();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.[CLIP_MIME])) return pasteElements(parsed[CLIP_MIME]);
    } catch { /* plain text */ }
    const c = getController()?.worldCenter();
    if (!c) return;
    const z = board.page.camera.z;
    const st = ui.get().text;
    const el: BoardElement = { id: uid(), type: 'text', x: c.x, y: c.y, text: text.slice(0, 5000), color: st.color, fontSize: st.size / z };
    board.addElements([el]);
    ui.set({ tool: 'select', selection: new Set([el.id]) });
    return;
  }
  if (clipboard.length) pasteElements(clipboard);
}

// ─── Images ───────────────────────────────────────────────────────────

export async function insertImage(file: Blob, at?: { x: number; y: number }) {
  try {
    const { src, w, h } = await readImageFile(file);
    const ctrl = getController();
    const c = at ?? ctrl?.worldCenter() ?? { x: 0, y: 0 };
    const z = board.page.camera.z;
    const vp = ctrl?.viewport ?? { width: 1200, height: 800 };
    // Fit comfortably inside ~60% of the viewport.
    const s = Math.min(1 / z, (vp.width * 0.6) / z / w, (vp.height * 0.6) / z / h);
    const el: BoardElement = { id: uid(), type: 'image', x: c.x - (w * s) / 2, y: c.y - (h * s) / 2, w: w * s, h: h * s, src };
    board.addElements([el]);
    ui.set({ tool: 'select', selection: new Set([el.id]) });
  } catch {
    toast('Couldn’t add that image');
  }
}

export function pickImage() {
  pickFile('image/*', (f) => insertImage(f));
}

function pickFile(accept: string, fn: (f: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => input.files?.[0] && fn(input.files[0]);
  input.click();
}

// ─── Files ────────────────────────────────────────────────────────────

export async function exportPng(appearance: Appearance) {
  const ctrl = getController();
  const cam = board.page.camera;
  const vp = ctrl?.viewport ?? { width: 1200, height: 800 };
  const blob = await pageToPng(board.page, boardTheme(appearance), { x: cam.x, y: cam.y, w: vp.width / cam.z, h: vp.height / cam.z });
  downloadBlob(blob, `${safeFilename(board.doc.title)}-${safeFilename(board.page.name)}.png`);
  toast('Exported PNG');
}

export async function copyPng(appearance: Appearance) {
  try {
    const cam = board.page.camera;
    const vp = getController()?.viewport ?? { width: 1200, height: 800 };
    const blob = await pageToPng(board.page, boardTheme(appearance), { x: cam.x, y: cam.y, w: vp.width / cam.z, h: vp.height / cam.z });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied page image');
  } catch {
    toast('Clipboard unavailable');
  }
}

const viewRect = () => {
  const cam = board.page.camera;
  const vp = getController()?.viewport ?? { width: 1200, height: 800 };
  return { x: cam.x, y: cam.y, w: vp.width / cam.z, h: vp.height / cam.z };
};

export function exportSvg(appearance: Appearance) {
  const svg = pageToSvg(board.page, boardTheme(appearance), viewRect(), `${board.doc.title} — ${board.page.name}`);
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeFilename(board.doc.title)}-${safeFilename(board.page.name)}.svg`);
  toast('Exported SVG');
}

/** Every page of the lesson as a PDF (one page each, sized to its content). */
export async function exportPdf(appearance: Appearance) {
  toast('Preparing PDF…');
  await new Promise((r) => setTimeout(r, 30));
  const theme = boardTheme(appearance);
  const fallback = viewRect();
  const pages = board.doc.pages.map((p) => {
    const j = pageToJpeg(p, theme, fallback);
    // World px → points, fitted to at most A4-ish landscape width so pages print sensibly.
    const k = Math.min(0.75, 842 / j.world.w, 842 / j.world.h);
    return { jpeg: dataUrlBytes(j.url), px: j.px, pt: { w: Math.max(72, j.world.w * k), h: Math.max(72, j.world.h * k) } };
  });
  const bytes = buildPdf(pages, board.doc.title);
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeFilename(board.doc.title)}.pdf`);
  toast(`Exported PDF · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`);
}

/** Copy a read-only preview link (the lesson travels in the link itself). */
export async function copyShareLink() {
  try {
    const { shareLink } = await import('../engine/share');
    const { url, dropped } = await shareLink(board.doc, location.href);
    await navigator.clipboard.writeText(url);
    toast(dropped ? 'Link copied — images were left out to keep it short' : 'Read-only link copied');
  } catch (err) {
    toast(err instanceof Error && err.message.includes('too large') ? err.message : 'Couldn’t create a link');
  }
}

export function pickPdf() {
  pickFile('application/pdf,.pdf', (f) => importPdf(f));
}

/**
 * Import a PDF: each PDF page becomes a lesson page with the page image
 * locked in place, ready to write on (the current page is used when empty).
 */
export async function importPdf(file: File) {
  toast('Importing PDF…');
  try {
    const { renderPdf } = await import('../engine/pdfImport');
    const images = await renderPdf(file, { onProgress: (n, total) => total > 1 && toast(`Importing PDF… ${n} of ${total}`) });
    if (!images.length) return;
    const name = file.name.replace(/\.pdf$/i, '');
    board.transaction(() => {
      let target = board.page.elements.length === 0 ? board.page.id : null;
      images.forEach((img, i) => {
        if (!target) {
          const index = board.doc.pages.findIndex((p) => p.id === board.doc.activePage) + 1;
          const page = createPage(images.length > 1 ? `${name} · ${i + 1}` : name, 'blank');
          board.commit({ kind: 'page', action: 'insert', index, page });
          board.setActivePage(page.id);
          target = page.id;
        }
        // 1 pt = 1 world unit at 100%, centred on the origin.
        const el: BoardElement = { id: uid(), type: 'image', x: -img.w / 2, y: -img.h / 2, w: img.w, h: img.h, src: img.src, locked: true };
        board.addElements([el], target);
        target = null;
      });
    });
    getController()?.zoomToFit();
    toast(images.length > 1 ? `Imported ${images.length} pages — each is locked so you can write on it` : 'PDF imported and locked — write on it freely');
  } catch (err) {
    console.warn('Flow: PDF import failed', err);
    toast('Couldn’t read that PDF');
  }
}

export function saveDocument() {
  exportDocument(board.doc);
  toast('Saved .flow file');
}

export function openDocument() {
  pickFile('.flow,application/json', (f) => openFlowFile(f));
}

/** Open a .flow file as a lesson; the current lesson is saved first. */
export async function openFlowFile(f: File) {
  try {
    await closeCurrent();
    const existing = new Set((await listLessons()).map((l) => l.id));
    await importLesson(f, existing);
    toast(`Opened “${board.doc.title}”`);
  } catch {
    toast('That isn’t a Flow file');
  }
}

/** Start a fresh lesson — the current one stays in Recents. */
export async function newDocument() {
  await closeCurrent();
  newLesson(board.page.background);
  toast('New lesson');
}

export function goToPage(delta: number) {
  const pages = board.doc.pages;
  const i = pages.findIndex((p) => p.id === board.doc.activePage);
  const next = pages[Math.max(0, Math.min(pages.length - 1, i + delta))];
  if (next) board.setActivePage(next.id);
}

export function openPresenter() {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'present');
  const w = window.open(url.toString(), 'flow-present', 'width=1280,height=800');
  if (!w) toast('Allow pop-ups to open the student view');
  else toast('Student view opened — share that window');
}
