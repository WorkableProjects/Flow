/**
 * LaTeX → self-contained SVG via MathJax (TeX input, SVG output).
 *
 * Glyphs come out as <path>s, so the result needs no web fonts: it can be
 * stored in the document, drawn on the canvas, synced to the student view
 * and exported without MathJax being loaded there. MathJax itself is
 * loaded on demand the first time the equation sheet opens.
 */

export interface TypesetResult {
  /** SVG markup with fill="currentColor" and px dimensions at `EM_PX` per em. */
  svg: string;
  /** Size in ems (MathJax units are 1/1000 em). */
  wEm: number;
  hEm: number;
}

/** Intrinsic px per em written into the SVG (drawing always scales it). */
export const EM_PX = 64;

export type MathMode = 'block' | 'inline';

interface Engine {
  svg: (tex: string, mode?: MathMode) => TypesetResult;
  mathml: (tex: string, mode?: MathMode) => string;
}

let loader: Promise<Engine> | null = null;

export function loadTex(): Promise<Engine> {
  loader ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }, { SerializedMmlVisitor }, { STATE }] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
      import('mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js'),
      import('mathjax-full/js/core/MathItem.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    // Errors should surface to the author, not render as red boxes on the board.
    const packages = AllPackages.filter((p: string) => !['noerrors', 'noundefined', 'bussproofs', 'require', 'autoload'].includes(p));
    const doc = mathjax.document('', {
      InputJax: new TeX({ packages, formatError: (_jax: unknown, err: Error) => { throw err; } }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    const visitor = new SerializedMmlVisitor();
    const mathml = (tex: string, mode: MathMode = 'block') => {
      const node = doc.convert(tex, { display: mode === 'block', end: STATE.CONVERT });
      const xml: string = visitor.visitTree(node);
      return mode === 'block' ? xml.replace(/^<math([^>]*)>/, (m: string, attrs: string) => (attrs.includes('display=') ? m : `<math${attrs} display="block">`)) : xml;
    };
    const svg = (tex: string, mode: MathMode = 'block') => {
      const node = doc.convert(tex, { display: mode === 'block' });
      const svgNode = adaptor.firstChild(node) as never;
      const raw: string = adaptor.outerHTML(svgNode);
      const vb = raw.match(/viewBox="([-\d.\s]+)"/)?.[1].trim().split(/\s+/).map(Number);
      if (!vb || vb.length !== 4) throw new Error('Could not typeset that equation');
      const wEm = vb[2] / 1000;
      const hEm = vb[3] / 1000;
      const out = raw
        .replace(/\sstyle="[^"]*"/, '')
        .replace(/\swidth="[^"]*"/, ` width="${(wEm * EM_PX).toFixed(2)}px"`)
        .replace(/\sheight="[^"]*"/, ` height="${(hEm * EM_PX).toFixed(2)}px"`)
        .replace(/\srole="img"/, '')
        .replace(/\sfocusable="false"/, '');
      return { svg: out, wEm, hEm };
    };
    return { svg, mathml };
  })();
  loader.catch(() => (loader = null));
  return loader;
}

export async function typeset(tex: string, mode: MathMode = 'block'): Promise<TypesetResult | { error: string }> {
  const source = tex.trim();
  if (!source) return { error: '' };
  try {
    const engine = await loadTex();
    return engine.svg(source, mode);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** MathML for an equation (for Word, Pages, Google Docs and screen readers). */
export async function toMathML(tex: string, mode: MathMode = 'block'): Promise<string> {
  const engine = await loadTex();
  return engine.mathml(tex.trim(), mode);
}
