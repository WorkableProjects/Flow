import { elementBounds, inflate, unionRects } from './geometry';
import { renderPage } from './renderer';
import type { BoardTheme } from './theme';
import type { Page } from './types';

/** Render a page's content bounds to a PNG blob (2× for crisp sharing). */
export async function pageToPng(page: Page, theme: BoardTheme, fallbackView: { x: number; y: number; w: number; h: number }, scale = 2): Promise<Blob> {
  const content = unionRects(page.elements.map(elementBounds));
  const r = content ? inflate(content, 48) : fallbackView;
  const maxPx = 8192;
  const s = Math.min(scale, maxPx / r.w, maxPx / r.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(r.w * s));
  canvas.height = Math.max(1, Math.round(r.h * s));
  const ctx = canvas.getContext('2d')!;
  renderPage(ctx, page, { cam: { x: r.x, y: r.y, z: 1 }, width: r.w, height: r.h, dpr: s, theme });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'));
}

/** A page's content as a JPEG (for PDF pages), with its size in world units. */
export function pageToJpeg(page: Page, theme: BoardTheme, fallbackView: { x: number; y: number; w: number; h: number }, scale = 2) {
  const content = unionRects(page.elements.map(elementBounds));
  const r = content ? inflate(content, 48) : fallbackView;
  const maxPx = 4096;
  const s = Math.min(scale, maxPx / r.w, maxPx / r.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(r.w * s));
  canvas.height = Math.max(1, Math.round(r.h * s));
  const ctx = canvas.getContext('2d')!;
  renderPage(ctx, page, { cam: { x: r.x, y: r.y, z: 1 }, width: r.w, height: r.h, dpr: s, theme });
  const url = canvas.toDataURL('image/jpeg', 0.9);
  const out = { url, px: { w: canvas.width, h: canvas.height }, world: { w: r.w, h: r.h } };
  canvas.width = canvas.height = 0;
  return out;
}

/** Small thumbnail data URL for the pages panel. */
export function pageThumbnail(page: Page, theme: BoardTheme, w = 176, h = 110): string {
  const content = unionRects(page.elements.map(elementBounds));
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  let cam = { x: -w / 2, y: -h / 2, z: 1 };
  if (content) {
    const r = inflate(content, 24);
    const z = Math.min(w / r.w, h / r.h, 1);
    cam = { x: r.x + r.w / 2 - w / 2 / z, y: r.y + r.h / 2 - h / 2 / z, z };
  }
  renderPage(ctx, page, { cam, width: w, height: h, dpr, theme });
  return canvas.toDataURL('image/png');
}
