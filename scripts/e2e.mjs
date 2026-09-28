#!/usr/bin/env node
/**
 * End-to-end smoke test against the production build.
 *
 *   npm run build && npm run e2e
 *
 * Drives real pointer input through Chromium and checks the document model:
 * first-run onboarding, Home (new lesson, recents), ink, shape snapping,
 * erasing, undo/redo, rich text, Apps (Screen Hider, LaTeX), pages, autosave, the tutor → student-view live
 * sync over BroadcastChannel, and the 1.2 features: rich text formats and lists, links, polygons and callouts,
 * partial erasing, grouping, the equation library and MathML, orbital diagrams, SVG/PDF export, PDF import
 * and read-only share links.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4180;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview timeout')), 15000);
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?bench`);

  // First launch: welcome sheet asks for the device type.
  const welcome = page.getByRole('dialog', { name: 'Welcome to Flow' });
  check('first launch asks for a first name', await page.getByRole('textbox', { name: 'First name' }).isVisible());
  await page.getByRole('textbox', { name: 'First name' }).fill('Caden');
  await page.getByRole('button', { name: 'Continue' }).click();
  check('then asks mobile vs desktop', await page.getByRole('radio', { name: /Desktop or Laptop/ }).isVisible());
  await page.getByRole('radio', { name: /Desktop or Laptop/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  check('device choice is applied', (await page.evaluate(() => document.documentElement.dataset.device)) === 'desktop' && !(await welcome.isVisible()));
  check('home shows empty recents', await page.getByText('No lessons yet').isVisible());
  check('home welcomes the user by name', await page.getByRole('heading', { name: 'Welcome, Caden.' }).isVisible());

  await page.getByRole('button', { name: 'New Lesson' }).click();
  await page.waitForFunction(() => !!window.__flowBoard);
  await page.getByTestId('board').waitFor();
  const count = () => page.evaluate(() => window.__flowBoard.page.elements.length);
  const types = () => page.evaluate(() => window.__flowBoard.page.elements.map((e) => e.type === 'shape' ? e.kind : e.type));
  const draw = async (pts, holdMs = 0) => {
    await page.mouse.move(...pts[0]);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 3 });
    if (holdMs) await page.waitForTimeout(holdMs);
    await page.mouse.up();
  };

  // Student view opens first and waits for the tutor.
  const viewer = await ctx.newPage();
  await viewer.goto(`http://localhost:${PORT}/?view=present&bench`);
  await viewer.waitForFunction(() => !!window.__flowBoard);

  await page.keyboard.press('p');
  await draw(Array.from({ length: 30 }, (_, i) => [300 + i * 12, 300 + Math.sin(i / 3) * 30]));
  check('pen stroke commits', (await types()).join() === 'stroke');

  const circle = Array.from({ length: 48 }, (_, i) => [800 + Math.cos((i / 47) * Math.PI * 2) * 80, 400 + Math.sin((i / 47) * Math.PI * 2) * 60]);
  await draw(circle, 800);
  check('hold-to-snap turns a circle into an ellipse', (await types())[1] === 'ellipse', (await types()).join());

  await page.keyboard.press('r');
  await draw([[300, 500], [500, 650]]);
  check('rectangle tool', (await types())[2] === 'rect');

  await page.keyboard.press('e');
  await draw([[400, 250], [400, 360]]);
  check('eraser removes the crossed stroke', !(await types()).includes('stroke'), (await types()).join());

  await page.keyboard.press('Control+z');
  check('undo restores the erased stroke', (await types()).includes('stroke'));
  await page.keyboard.press('Control+Shift+z');
  check('redo erases again', !(await types()).includes('stroke'));

  await page.keyboard.press('t');
  await page.mouse.click(600, 200);
  await page.keyboard.type('Area = πr²');
  await page.keyboard.press('Escape');
  const text = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'text')?.text);
  check('text tool', text === 'Area = πr²', String(text));

  // Rich text: bold a word while typing, then check the stored spans.
  await page.mouse.click(600, 120);
  await page.keyboard.type('Rich ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('Escape');
  const rich = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'text' && e.text.startsWith('Rich')));
  check('rich text keeps formatting', rich?.text === 'Rich bold' && rich.spans?.some((s) => s.text === 'bold' && s.marks?.bold), JSON.stringify(rich?.spans));

  // Apps: Screen Hider toggles, LaTeX typesets and inserts a vector equation.
  await page.getByRole('button', { name: 'Apps' }).click();
  await page.getByRole('button', { name: /Screen Hider/ }).click();
  check('Screen Hider opens from Apps', await page.getByRole('slider', { name: 'Curtain position' }).isVisible());
  await page.getByRole('button', { name: /Screen Hider/ }).click();
  await page.getByRole('button', { name: /LaTeX Equation/ }).click();
  await page.getByRole('textbox', { name: 'LaTeX source' }).fill('\\frac{a}{b} = \\sqrt{x^2}');
  const insert = page.getByRole('button', { name: 'Insert', exact: true });
  await page.waitForFunction(() => !document.querySelector('[aria-label="LaTeX equation"] button:disabled'), null, { timeout: 15000 }).catch(() => {});
  await insert.click();
  const eq = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'equation'));
  check('LaTeX equation is inserted as vector SVG', !!eq && eq.svg.startsWith('<svg') && eq.svg.includes('<path') && eq.w > 0, eq?.latex);
  await page.keyboard.press('Control+z');
  check('equation insert is undoable', !(await types()).includes('equation'));

  // Elements: a Bohr model with three energy levels = nucleus + 3 rings + p/n labels.
  const before = (await types()).filter((t) => t === 'ellipse').length;
  await page.getByRole('button', { name: 'Apps' }).click();
  await page.getByRole('button', { name: /Elements/ }).click();
  await page.getByRole('radio', { name: '3 energy levels' }).click();
  await page.getByRole('dialog', { name: 'Elements' }).getByRole('button', { name: 'Insert', exact: true }).click();
  const bohr = await page.evaluate(() => {
    const els = window.__flowBoard.page.elements;
    return { rings: els.filter((e) => e.type === 'shape' && e.kind === 'ellipse').length, labels: els.filter((e) => e.type === 'text' && /^[pn] =$/.test(e.text)).length };
  });
  check('Elements inserts a Bohr model with 3 energy levels', bohr.rings - before === 4 && bohr.labels === 2, JSON.stringify(bohr));

  // Dot tool: a tap near the outer orbit lands exactly on it.
  const orbit = await page.evaluate(() => {
    const els = window.__flowBoard.page.elements.filter((e) => e.type === 'shape' && e.kind === 'ellipse');
    const o = els[els.length - 1];
    const cam = window.__flowBoard.page.camera;
    const cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2, r = (o.x2 - o.x1) / 2;
    return { sx: (cx + r - cam.x) * cam.z - 6, sy: (cy - cam.y) * cam.z + 3, cx, cy, r };
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await page.mouse.click(orbit.sx, orbit.sy);
  const dot = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'dot'));
  check('dot tool snaps onto a Bohr orbit', !!dot && Math.abs(Math.hypot(dot.x - orbit.cx, dot.y - orbit.cy) - orbit.r) < 0.01, JSON.stringify(dot && { x: dot.x, y: dot.y }));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  const n = await count();
  check('select all + duplicate', n === 8, `${n} elements`);

  await viewer.waitForTimeout(300);
  const viewerCount = await viewer.evaluate(() => window.__flowBoard.page.elements.length);
  check('student view mirrors the board live', viewerCount === n, `${viewerCount} vs ${n}`);

  await page.getByRole('button', { name: 'New page' }).click();
  check('new page', (await page.evaluate(() => window.__flowBoard.doc.pages.length)) === 2);
  await viewer.waitForTimeout(300);
  check('student view follows page changes', (await viewer.evaluate(() => window.__flowBoard.doc.pages.length)) === 2);

  await page.getByRole('button', { name: 'All lessons' }).click();
  const card = page.getByRole('button', { name: /Untitled Lesson.*2 pages/ });
  await card.waitFor({ timeout: 5000 }).catch(() => {});
  check('lesson appears in Recent Lessons', await card.isVisible());
  check('onboarding does not reappear', !(await welcome.isVisible()));

  await page.getByRole('button', { name: 'New Lesson' }).click();
  await page.getByRole('button', { name: 'All lessons' }).click();
  await page.waitForTimeout(300);
  check('untouched new lessons are not kept', (await page.getByRole('button', { name: /^Untitled Lesson/ }).count()) === 1);

  await page.reload();
  await page.getByRole('button', { name: /Untitled Lesson.*2 pages/ }).click();
  await page.waitForFunction(() => window.__flowBoard.doc.pages.length === 2);
  const persisted = await page.evaluate(() => window.__flowBoard.doc.pages.map((p) => p.elements.length));
  check('lesson reopens from Recents after reload', persisted.join() === `${n},0`, persisted.join());


  // ─── 1.2.0 ─────────────────────────────────────────────────────────
  await page.bringToFront();
  await page.getByRole('button', { name: 'All lessons' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'New Lesson' }).click();
  await page.waitForFunction(() => window.__flowBoard.doc.pages.length === 1 && window.__flowBoard.page.elements.length === 0);
  await page.getByTestId('board').waitFor();
  await page.waitForTimeout(700);
  const els = () => page.evaluate(() => window.__flowBoard.page.elements);

  await page.keyboard.press('t');
  await page.mouse.click(400, 250);
  await page.keyboard.type('Steps');
  await page.keyboard.press('Enter');
  await page.keyboard.type('mix');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Enter');
  await page.keyboard.type('heat');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+Shift+x');
  await page.keyboard.press('Escape');
  const list = (await els()).find((e) => e.type === 'text');
  check('rich text: numbered list and strikethrough', list?.text === 'Steps\nmix\nheat' && JSON.stringify(list.paras) === JSON.stringify([{}, { list: 'number' }, { list: 'number' }]) && list.spans?.some((sp) => sp.text === 'heat' && sp.marks?.strike), JSON.stringify(list));

  await page.mouse.click(400, 450);
  await page.keyboard.type('See ');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Link address' }).fill('example.com');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const linked = (await els()).find((e) => e.type === 'text' && e.text.startsWith('See'));
  check('rich text: ⌘K adds a safe link', linked?.spans?.some((sp) => sp.marks?.link === 'https://example.com'), JSON.stringify(linked?.spans));

  await page.keyboard.press('g');
  for (const [x, y] of [[700, 200], [850, 180], [900, 300]]) await page.mouse.click(x, y);
  await page.mouse.click(700, 200);
  await page.keyboard.press('b');
  await draw([[700, 420], [900, 520]]);
  check('polygon and callout tools', (await types()).filter((t) => t === 'polygon' || t === 'callout').join() === 'polygon,callout', (await types()).join());

  await page.keyboard.press('p');
  await draw(Array.from({ length: 30 }, (_, i) => [200 + i * 14, 620]));
  await page.keyboard.press('e');
  await page.getByRole('radio', { name: /Partial/ }).click();
  await draw([[400, 590], [400, 650]]);
  check('partial eraser splits a stroke', (await types()).filter((t) => t === 'stroke').length === 2, (await types()).join());
  await page.keyboard.press('Control+z');
  check('partial erase undoes to one stroke', (await types()).filter((t) => t === 'stroke').length === 1);
  await page.getByRole('radio', { name: /Object/ }).click();

  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  const grouped = await els();
  check('⌘G groups the selection', grouped.length > 1 && grouped.every((e) => e.groupId && e.groupId === grouped[0].groupId));
  await page.keyboard.press('Escape');
  await page.mouse.click(850, 180);
  const selectedCount = Number((await page.getByText(/^\d+ selected$/).textContent().catch(() => '0')).match(/\d+/)?.[0]);
  check('clicking one member selects the whole group', selectedCount === grouped.length, `${selectedCount} of ${grouped.length}`);
  await page.keyboard.press('Control+z');
  check('grouping is undoable', (await els()).every((e) => !e.groupId));
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Apps' }).click();
  check('Text is no longer in Apps', (await page.getByRole('button', { name: /^Text Rich text/ }).count()) === 0);
  await page.getByRole('button', { name: /LaTeX Equation/ }).click();
  await page.getByRole('tab', { name: /Library/ }).click();
  await page.getByRole('button', { name: /Quadratic formula/ }).click();
  await page.getByRole('radio', { name: 'Inline' }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="LaTeX equation"] button:disabled'), null, { timeout: 15000 }).catch(() => {});
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  const quad = (await els()).find((e) => e.type === 'equation');
  check('equation library inserts an inline equation', quad?.latex.startsWith('x = \\frac') && quad.mode === 'inline', quad?.latex);
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Copy as MathML' }).click();
  await page.waitForTimeout(500);
  check('equation copies as MathML', (await page.evaluate(() => navigator.clipboard.readText())).includes('<mfrac>'));
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  check('equation rotates', (await els()).find((e) => e.type === 'equation')?.rotation === 90);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Apps' }).click();
  await page.getByRole('button', { name: /Elements/ }).click();
  await page.getByRole('radio', { name: /Orbital Diagram/ }).click();
  await page.getByLabel('Find element').fill('N');
  await page.getByRole('dialog', { name: 'Elements' }).getByRole('button', { name: 'Insert', exact: true }).click();
  const diagram = await page.evaluate(() => {
    const els = window.__flowBoard.page.elements;
    const g = els[els.length - 1].groupId;
    const mine = els.filter((e) => e.groupId === g);
    return { boxes: mine.filter((e) => e.kind === 'rect').length, arrows: mine.filter((e) => e.kind === 'arrow').length, config: mine.some((e) => e.text === '1s² 2s² 2p³') };
  });
  check('orbital diagram for nitrogen', diagram.boxes === 5 && diagram.arrows === 8 && diagram.config, JSON.stringify(diagram));

  await page.getByRole('button', { name: 'Share & export' }).click();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Page as SVG/ }).click()]);
  const svgText = await (await import('node:fs/promises')).readFile(await svg.path(), 'utf8');
  check('exports the page as SVG', svgText.startsWith('<svg') && svgText.includes('Steps') && svgText.includes('<ellipse') === false && svgText.includes('<path'));
  await page.getByRole('button', { name: 'Share & export' }).click();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Lesson as PDF/ }).click()]);
  const pdfPath = await pdf.path();
  const pdfBytes = await (await import('node:fs/promises')).readFile(pdfPath);
  check('exports the lesson as PDF', pdfBytes.subarray(0, 5).toString() === '%PDF-' && pdfBytes.includes('/DCTDecode'));

  // PDF import: bring our own export back in as a locked page image.
  const pagesBefore = await page.evaluate(() => window.__flowBoard.doc.pages.length);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), (async () => {
    await page.getByRole('button', { name: 'Share & export' }).click();
    await page.getByRole('button', { name: /Import PDF/ }).click();
  })()]);
  await chooser.setFiles({ name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await page.waitForFunction((n) => window.__flowBoard.doc.pages.length === n + 1, pagesBefore, { timeout: 20000 }).catch(() => {});
  const imported = await page.evaluate(() => window.__flowBoard.page.elements);
  check('imports a PDF page onto a new page, locked', imported.length === 1 && imported[0].type === 'image' && imported[0].locked === true, JSON.stringify(imported.map((e) => e.type)));
  await page.keyboard.press('e');
  await draw([[500, 300], [800, 500]]);
  check('the eraser leaves locked pages alone', (await page.evaluate(() => window.__flowBoard.page.elements.length)) === 1);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  await page.getByRole('button', { name: 'Share & export' }).click();
  await page.getByRole('button', { name: /read-only link/ }).click();
  await page.waitForTimeout(600);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const shared = await ctx.newPage();
  await shared.goto(link);
  await shared.getByText('Read-only').waitFor({ timeout: 5000 }).catch(() => {});
  check('read-only share link opens a preview', link.includes('view=shared#d=') && (await shared.getByRole('button', { name: /Save a Copy/ }).isVisible()));
  await shared.close();

  // Reset Profile brings back the first-launch welcome.
  await page.getByRole('button', { name: 'All lessons' }).click().catch(() => {});
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset Profile' }).click();
  check('Reset Profile shows the welcome again', await page.getByRole('textbox', { name: 'First name' }).isVisible());

  check('no uncaught errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
