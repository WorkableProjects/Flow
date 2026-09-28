/**
 * A tiny PDF writer: one full-bleed JPEG image per page. Enough for
 * printing and sharing a lesson as a handout without pulling in a PDF
 * library.
 */

export interface PdfPage {
  /** JPEG bytes. */
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  px: { w: number; h: number };
  /** Page size in points (1/72 in). */
  pt: { w: number; h: number };
}

const enc = new TextEncoder();

export function buildPdf(pages: PdfPage[], title = 'Flow'): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: () => void) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  const pdfString = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // 1 catalog, 2 pages, 3 info; then per page: page, contents, image.
  const pageIds = pages.map((_, i) => 4 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  obj(3, () => push(`<< /Title ${pdfString(title)} /Producer (Flow) /Creator (Flow by Workable) >>`));
  pages.forEach((p, i) => {
    const id = pageIds[i];
    const w = +p.pt.w.toFixed(2), h = +p.pt.h.toFixed(2);
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(id + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.px.w} /Height ${p.px.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
