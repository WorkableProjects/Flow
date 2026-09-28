import type { FlowDocument } from './types';

/**
 * Read-only share links with no server: the lesson is compressed into the
 * URL fragment (never sent to any server), and `?view=shared` opens it in
 * a read-only preview that can save a copy.
 */

export const SHARE_PARAM = 'd';
/** Browsers handle fragments well into megabytes; stay comfortably below. */
export const MAX_LINK = 1_500_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeDocument(doc: FlowDocument): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeDocument(s: string): Promise<unknown> {
  const bytes = await pipe(fromBase64Url(s), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Copy of a document without embedded images (they make links huge). */
export function withoutImages(doc: FlowDocument): FlowDocument {
  return { ...doc, pages: doc.pages.map((p) => ({ ...p, elements: p.elements.filter((e) => e.type !== 'image') })) };
}

/**
 * A share link for `doc`. Images are left out when the link would be too
 * long; `dropped` says so.
 */
export async function shareLink(doc: FlowDocument, base: string): Promise<{ url: string; dropped: boolean }> {
  const make = async (d: FlowDocument) => {
    const u = new URL(base);
    u.search = '?view=shared';
    u.hash = `${SHARE_PARAM}=${await encodeDocument(d)}`;
    return u.toString();
  };
  const url = await make(doc);
  if (url.length <= MAX_LINK) return { url, dropped: false };
  const lean = await make(withoutImages(doc));
  if (lean.length > MAX_LINK) throw new Error('This lesson is too large to share as a link. Save it as a .flow file instead.');
  return { url: lean, dropped: true };
}

/** The shared document in the current URL, if any. */
export async function readSharedFromLocation(): Promise<unknown | null> {
  const m = new URLSearchParams(location.hash.slice(1)).get(SHARE_PARAM);
  return m ? decodeDocument(m) : null;
}
