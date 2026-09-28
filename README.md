# Flow

```bash
npm install
npm run dev -- --host        # http://localhost:5173
npm run build                # typecheck + production build
npm test                     # unit tests
npm run e2e                  # end-to-end tests in Chromium (after build)
npm run perf                 # canvas benchmark in Chromium (after build)
npm run icons                # regenerate SF Symbols (src/icons/symbols.ts)
```

Flow is a digital whiteboard for online tutoring. It runs in the browser, works offline, and follows Apple's design language: content first, controls on a floating Liquid Glass layer, and motion that means something.

**Version 1.2.0** · Flow by Workable using Claude © 2026

---

## Overview

| Area | What you get |
|---|---|
| **Ink** | Pressure-sensitive pen with adjustable smoothing, highlighter, laser pointer, palm rejection |
| **Shapes** | Rectangle, ellipse, triangle, line, arrow, polygon, callout; hold-to-snap shape recognition |
| **Text** | Rich text and sticky notes: fonts, sizes, colors, alignment, lists, links, code, highlight, strikethrough |
| **Math** | LaTeX equations with a symbol palette, an equation library, inline/block modes and MathML export |
| **Science** | Bohr models, orbital diagrams and element tiles for hydrogen through xenon |
| **Objects** | Multi-select, group, lock, layers, align, distribute, snap to grid, nudge |
| **Files** | PNG, SVG and PDF export; PDF import; `.flow` lesson files; read-only share links |
| **Teaching** | Lesson pages and paper, Screen Hider, session timer, live student view |

## Features

### Home and onboarding
- **Recent Lessons** with thumbnails, last edited time, page count, search and delete; **New Lesson**, **Start with** paper templates and **Open File…**
- First launch asks for a first name and the device type (tablet/phone or desktop/laptop) and tunes the interface to it. Both can be changed in Settings, and **Reset Profile** runs the welcome again without touching lessons
- Lessons autosave to an on-device library (IndexedDB). Untouched new lessons are discarded. Deep links: `?lesson=new`, `?lesson=<id>`

### Drawing and annotation
- **Pen** with real stylus pressure (simulated for mouse and touch). The pen inspector sets **Smoothing** and can turn **Pressure sensitivity** off for constant-width lines
- **Highlighter**, **laser pointer** with a fading trail, and palm rejection once a stylus is detected
- **Shapes:** rectangle, ellipse, triangle, line, arrow, **polygon** (tap each corner, tap the first to close, or press Return) and **callout** (speech bubble). Optional fill; hold ⇧ to constrain
- **Hold to snap:** draw a rough line, circle, rectangle or triangle and pause, and it becomes a clean vector shape. Lines within a few degrees of horizontal, vertical or 45° straighten; near-circles and near-squares become exact
- **Eraser** in two modes: **Object** removes whole strokes and objects, **Partial** removes only the part of a stroke you touch. **Clear** empties the page (undoable). Locked items are never erased
- **Dot tool** for electrons and graph points, snapping onto circles such as Bohr orbits
- **Vector stroke optimization:** committed strokes drop samples that don't change their shape and are rounded, so lessons stay small

### Rich text
- Text boxes and sticky notes with a floating format bar: **bold**, *italic*, underline, strikethrough, text color and links, plus an **Aa** sheet for font (System, Serif, Rounded, Mono), size, alignment (left, center, right, and justify for sticky notes), bulleted and numbered lists, inline code and highlight
- Formatting works on a selection or on the next thing you type. Return continues a list; Return on an empty item ends it
- Selected text boxes can be formatted from the selection bar without opening the editor
- Links are limited to web and mail addresses. ⌘-click a link on the board (or use **Open link** in the selection bar) to follow it
- Text is stored as a plain-text mirror plus optional spans and paragraph styles, so older readers still see the words and new formats never need a migration

### Objects
- Multi-select by tap, ⇧-tap or marquee; select all with ⌘A
- **Group** (⌘G) and **Ungroup** (⇧⌘G). Tapping any member selects the group; double-click selects a single member
- **Layers:** bring forward/backward (`]` / `[`) and to front/back (`⇧]` / `⇧[`)
- **Align** left, center, right, top, middle or bottom, and **distribute** horizontally or vertically. Groups move as units
- **Snap to grid** (⌘'), using the spacing of the page's paper
- **Lock** an object so taps, the marquee and the eraser pass through it. Double-click a locked object to select and unlock it
- Arrow keys nudge the selection by 1 pt, or 10 pt with ⇧
- Undo and redo cover every change, including page reordering. Multi-part changes (grouping, aligning, partial erasing) undo in one step

### LaTeX equations
- Type TeX and watch it typeset live, then insert it as a vector object that stays sharp at any zoom. Double-click or tap **Edit** to change it
- **Symbol palette:** structures, Greek letters, operators, relations, arrows, sets and logic
- **Equation library:** ready-made formulas for algebra, geometry and trigonometry, calculus, physics, chemistry (with `\ce{}` reactions) and statistics
- **Block** or **Inline** typesetting
- **Copy as MathML** for Pages, Word, Google Docs and screen readers
- **Rotate** 90°, **flip** horizontally or vertically, and **annotate**: a note is added under the equation and grouped with it
- MathJax loads only when the equation sheet first opens

### Elements (science)
- **Bohr model:** blank rings (1–5 energy levels with `p =` and `n =` to fill in), or a real element with its protons, neutrons and electrons placed on each shell
- **Orbital diagram:** boxes and ↑↓ electrons filled by Hund's rule, as an energy-level chart (1s at the bottom, with an energy axis) or in row notation, with the electron configuration written out. Configurations follow the aufbau order, including the real exceptions (Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag)
- **Element tile:** atomic number, symbol, name and atomic mass
- Search elements by symbol, name or number (hydrogen to xenon). Everything is inserted as ordinary shapes and text, grouped so it moves as one

### Files and sharing
- **Export:** page as PNG (or copy it), page as **SVG** (real text, vector ink and equations), and the whole lesson as a **PDF** with one page per lesson page
- **Import PDF:** each PDF page becomes a lesson page with the page image locked in place, ready to write on
- **Read-only link:** the lesson is compressed into the link itself (the fragment is never sent to a server). The link opens a preview where viewers can page through, zoom, and **Save a Copy**. Images are left out if the link would be too long
- Save and open `.flow` lesson files (⌘S, ⌘O), or drag them onto the window

### For tutoring
- **Lesson pages** with thumbnails, reorder, duplicate and rename; **paper per page:** blank, dots, grid, lined, and graph paper with labelled axes
- **Screen Hider:** an overhead-projector shade you drag down to reveal steps one at a time (`C`)
- **Session timer:** countdown presets or stopwatch, with a soft chime
- **Student view:** a clean, chrome-free window that mirrors the board live (page, camera, ink as it's drawn, laser). Share that one window in Zoom, Meet or Teams

### Personalization and accessibility
- **Customize Toolbar** (Settings): show, hide and reorder the dock's tools. Hidden tools still work from the keyboard
- **Keyboard Shortcuts** sheet (`?`) lists every shortcut
- Light, dark and automatic appearance; drawing colors are semantic and adapt to both
- Honors Reduce Motion and Reduce Transparency; controls are labelled for assistive technology, and the selection bar announces what is selected

## Design

Flow follows the Apple Design Language guide:

- **Tokens by role** (`--label`, `--bg-2`, `--tint`…). Dark mode is a token swap, not a redesign
- **Liquid Glass** only on the control layer, never on content, and never glass on glass: menus and sheets render in a separate layer
- **Layout:** 44 pt targets, concentric radii, a 4/8 spacing rhythm, the SF type ramp (`-apple-system`, with Inter as fallback)
- **Motion:** springs (`cubic-bezier(.32,.72,0,1)`), brief and interruptible. The selected tool is a single liquid bubble that flows between buttons
- **Contextual controls:** a compact shelf above the dock changes with the tool, and swaps places with the selection bar, which offers formatting for text and transforms for equations
- **Mobile performance:** with the Mobile device selected, decorative motion and WebGL glass are dropped and blur is lighter
- **Brand:** primary accent `#FF6083` is the app tint; secondary accent `#FFD3D6` backs tinted controls. Source artwork for the app icon lives in `assets/brand/`

## Keyboard shortcuts

| Keys | Action |
|---|---|
| V · H · P · M · E · L | Select · Pan · Pen · Highlighter · Eraser · Laser |
| S · R · O · A · G · B | Shapes · Rectangle · Ellipse · Arrow · Polygon · Callout |
| D · T · N · I | Dot · Text · Sticky note · Image |
| ⌘B · ⌘I · ⌘U · ⇧⌘X | Bold · Italic · Underline · Strikethrough |
| ⌘E · ⇧⌘H · ⌘K | Code · Highlight · Link |
| ⇧⌘8 · ⇧⌘7 | Bulleted · Numbered list |
| ⇧⌘L · ⇧⌘E · ⇧⌘R · ⇧⌘J | Align left · center · right · justify |
| ⌘G · ⇧⌘G | Group · Ungroup |
| ] · [ · ⇧] · ⇧[ | Forward · Backward · To front · To back |
| ⌘' · Arrows | Snap to grid · Nudge |
| ⌘Z · ⇧⌘Z | Undo · Redo |
| ⌘0 · ⌘1 · ⌘ + scroll | Actual size · Zoom to fit · Zoom |
| PgUp · PgDn · ⌥P | Previous page · Next page · Pages |
| C · ? | Screen Hider · Shortcuts |

## Architecture

```
src/
  engine/          framework-free core
    types.ts         immutable document model (elements, pages, camera)
    store.ts         BoardStore: ops-based undo/redo, transactions, change events (also the sync unit)
    geometry.ts      camera math, bounds, hit-testing, transforms, shared text layout
    richtext.ts      marks, paragraphs, layout (wrap, lists, alignment), editor HTML ⇄ rich text
    arrange.ts       groups, align/distribute, z-order, grid, partial erasing
    freehand.ts      perfect-freehand → Path2D / SVG, ink feel, stroke optimization
    renderer.ts      element + background painting, image cache
    svg.ts · pdf.ts  vector SVG export · minimal PDF writer
    pdfImport.ts     PDF pages → images (pdf.js, loaded on demand)
    share.ts         read-only links (deflate + base64url in the URL fragment)
    latex.ts         lazy MathJax: TeX → SVG and MathML
    mathLibrary.ts   equation library and symbol palette
    chem.ts          periodic table (H–Xe) and electron configurations
    presets.ts       Elements presets and dot-to-ring snapping
    tiles.ts         tiled raster cache for the committed scene
    recognize.ts     hold-to-snap shape recognition
    sync.ts          BroadcastChannel tutor ↔ student view
    persistence.ts   IndexedDB lesson library, .flow files, image import
  canvas/
    controller.ts    pointer input, tools, frame loop (outside React)
    TextEditor.tsx   model-driven contenteditable rich text editor
    transitions.ts   page slide / crossfade from a snapshot of the last frame
  home/            Home (welcome + recents) and first-run onboarding
  state/           UI prefs, lesson lifecycle, actions
  ui/              glass toolbars, bubble, Apps, sheets, format bar, inspector, pages, timer, curtain
  icons/           SF Symbols → <Icon>, generated by scripts/build-icons.mjs
  vendor/liquidglass/   WebGL Liquid Glass (see its README)
  SharedApp.tsx    read-only preview for share links
  PresenterApp.tsx student view
```

### Rich text model
Every surface that shows text (canvas, editor, SVG export, link hit-testing) uses one layout function, so text wraps, indents and aligns identically everywhere. The editor types natively in a `contenteditable`, but every format command goes through the model: read the DOM into spans, change them, write canonical HTML, restore the selection. What you see is exactly what's stored.

### Performance
- **Out of React:** the hot path (pointer → ink → pixels) never re-renders React. The controller owns two canvases and a single `requestAnimationFrame` loop that runs only when something changed
- **Two layers:** *scene* holds committed content; *live* holds in-progress ink, previews, selection and the laser. The live layer uses a `desynchronized` 2D context for low-latency ink and `getCoalescedEvents()` for full-rate (120–240 Hz) stylus samples
- **Tiled scene cache:** the scene is cut into 256 px device tiles per scale. Panning and zooming blit cached bitmaps; new tiles rasterize under a per-frame time budget. At rest, tiles re-render at the exact scale so ink stays crisp. Committing a stroke paints it straight into the existing tiles
- **Cached layout:** text layout, element bounds and stroke outlines are cached per (immutable) element
- **Region-aware glass:** the WebGL glass refreshes only the bars over changed pixels
- **Memory:** decoded images from the previous lesson are released when another lesson opens, and heavy libraries (MathJax, pdf.js) load only when first used

`npm run perf` (headless Chromium, 1440 × 900, a board with 2,000 strokes; budget is p95 < 8 ms of render work per frame):

| Scenario | p50 | p95 | Frame cadence |
|---|---|---|---|
| 240 Hz ink stroke | 0.3 ms | 0.5 ms | 60 fps |
| Pan heavy board | 2.5 ms | 4.8 ms | 60 fps |
| Zoom heavy board | 1.4 ms | 7.4 ms | 60 fps |
| Commit strokes | 0.8 ms | 0.9 ms | – |

Headless Chromium rasterizes on the CPU, so results vary with the machine and `DPR=2 npm run perf` is fill-rate bound there. On real hardware, GPU compositing handles Retina fill rate.

## Credits

Flow by Workable using Claude © 2026.

- Liquid Glass: [ybouane/liquidglass](https://github.com/ybouane/liquidglass) (MIT)
- Icons: SF Symbols exported by [brendanballon/sfsymbols-svg](https://github.com/brendanballon/sfsymbols-svg). SF Symbols are © Apple and licensed for use on Apple platforms; swap `scripts/build-icons.mjs` to another icon set before shipping elsewhere
- Equations: [MathJax](https://github.com/mathjax/MathJax-src) (Apache-2.0)
- PDF import: [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0)
- Ink: [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (MIT)
