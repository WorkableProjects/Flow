/**
 * Import a PDF (a worksheet, slides, notes) as page images. pdf.js is
 * loaded only when a PDF is first imported.
 */

export interface PdfPageImage {
  src: string;
  /** Size in PDF points (1/72 in). */
  w: number;
  h: number;
}

/** Render every page (up to `maxPages`) to a JPEG about `targetPx` wide. */
export async function renderPdf(file: Blob, opts: { maxPages?: number; targetPx?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<PdfPageImage[]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const total = Math.min(doc.numPages, opts.maxPages ?? 50);
    const out: PdfPageImage[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, (opts.targetPx ?? 1600) / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push({ src: canvas.toDataURL('image/jpeg', 0.86), w: base.width, h: base.height });
      page.cleanup();
      canvas.width = canvas.height = 0;
      opts.onProgress?.(n, total);
    }
    return out;
  } finally {
    await task.destroy();
  }
}
