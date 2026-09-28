import { describe, expect, it } from 'vitest';
import { bohrModel, MAX_ENERGY_LEVELS, snapToRing } from './presets';

const opts = { cx: 100, cy: 50, unit: 1, color: 'label' };
const rings = (n: number) => bohrModel(n, opts).filter((e) => e.type === 'shape');

describe('Bohr model preset', () => {
  it('draws the nucleus plus one ring per energy level', () => {
    expect(rings(1)).toHaveLength(2);
    expect(rings(3)).toHaveLength(4);
  });

  it('caps energy levels at five and floors at one', () => {
    expect(rings(9)).toHaveLength(MAX_ENERGY_LEVELS + 1);
    expect(rings(0)).toHaveLength(2);
  });

  it('keeps rings concentric and labels p/n inside the nucleus', () => {
    const els = bohrModel(2, opts);
    for (const r of els.filter((e) => e.type === 'shape')) {
      if (r.type !== 'shape') continue;
      expect((r.x1 + r.x2) / 2).toBe(100);
      expect((r.y1 + r.y2) / 2).toBe(50);
    }
    const labels = els.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : ''));
    expect(labels).toEqual(['p =', 'n =']);
    expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
  });

  it('scales with zoom so it lands at a readable size', () => {
    const [a] = bohrModel(1, opts);
    const [b] = bohrModel(1, { ...opts, unit: 2 });
    if (a.type !== 'shape' || b.type !== 'shape') throw new Error('expected nucleus');
    expect(b.x2 - b.x1).toBe((a.x2 - a.x1) * 2);
  });
});

describe('snapToRing', () => {
  const els = bohrModel(2, { cx: 0, cy: 0, unit: 1, color: 'label' });
  it('puts a dot dropped near an orbit exactly on it', () => {
    // Second ring radius: 56 + 2 * 40 = 136.
    const p = snapToRing(els, { x: 130, y: 5 }, 16);
    expect(p.snapped).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(136, 5);
  });
  it('leaves a dot alone when no ring is close', () => {
    expect(snapToRing(els, { x: 300, y: 300 }, 16)).toEqual({ x: 300, y: 300, snapped: false });
  });
  it('picks the nearest of several rings', () => {
    const p = snapToRing(els, { x: 100, y: 0 }, 16); // ring 1 at 96
    expect(p.x).toBeCloseTo(96, 5);
  });
});

import { configuration, configurationText, findElement, orbitalFilling, shellCounts } from './chem';
import { bohrElement, elementTile, orbitalDiagram } from './presets';

describe('chemistry', () => {
  it('builds ground-state configurations, including exceptions', () => {
    expect(configurationText(8)).toBe('1s² 2s² 2p⁴');
    expect(configurationText(24)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵ 4s¹');
    expect(configurationText(29)).toContain('3d¹⁰ 4s¹');
    expect(configuration(46).some((s) => s.n === 5)).toBe(false);
    expect(shellCounts(19)).toEqual([2, 8, 8, 1]);
    expect(findElement('fe')?.z).toBe(26);
    expect(findElement('Carb')?.symbol).toBe('C');
  });

  it("fills orbitals by Hund's rule", () => {
    expect(orbitalFilling(1, 4)).toEqual([2, 1, 1]);
    expect(orbitalFilling(2, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(orbitalFilling(0, 2)).toEqual([2]);
  });

  it('orbital diagrams draw one box per orbital and one arrow per electron', () => {
    for (const style of ['energy', 'row'] as const) {
      const els = orbitalDiagram(8, style, { cx: 0, cy: 0, unit: 1, color: 'label' });
      const rects = els.filter((e) => e.type === 'shape' && e.kind === 'rect');
      const arrows = els.filter((e) => e.type === 'shape' && e.kind === 'arrow');
      expect(rects).toHaveLength(5);
      expect(arrows.length - (style === 'energy' ? 1 : 0)).toBe(8);
      expect(new Set(els.map((e) => e.groupId)).size).toBe(1);
    }
  });

  it('Bohr models of real elements place every electron', () => {
    const els = bohrElement(11, { cx: 0, cy: 0, unit: 1, color: 'label' });
    expect(els.filter((e) => e.type === 'dot')).toHaveLength(11);
    expect(els.some((e) => e.type === 'text' && e.text === 'n = 12')).toBe(true);
    expect(elementTile(6, { cx: 0, cy: 0, unit: 1, color: 'label' }).some((e) => e.type === 'text' && e.text === 'C')).toBe(true);
  });
});
