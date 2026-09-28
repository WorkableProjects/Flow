import { describe, expect, it } from 'vitest';
import { alignUnits, distributeUnits, eraseStrokeSegment, expandGroups, orderOp, reorder, replaceWithPieces, selectionUnits } from './arrange';
import { optimizePoints } from './freehand';
import { elementBounds } from './geometry';
import { BoardStore } from './store';
import type { BoardElement, StrokeElement } from './types';

const dot = (id: string, x: number, y = 0, groupId?: string): BoardElement => ({ id, type: 'dot', x, y, r: 5, color: 'label', ...(groupId ? { groupId } : {}) });
const ids = (els: BoardElement[]) => els.map((e) => e.id).join('');

describe('arrange', () => {
  it('reorders one step and to the ends, keeping relative order', () => {
    const els = ['a', 'b', 'c', 'd'].map((id, i) => dot(id, i));
    expect(ids(reorder(els, new Set(['a']), 'forward'))).toBe('bacd');
    expect(ids(reorder(els, new Set(['a', 'b']), 'forward'))).toBe('cabd');
    expect(ids(reorder(els, new Set(['d']), 'backward'))).toBe('abdc');
    expect(ids(reorder(els, new Set(['b', 'd']), 'front'))).toBe('acbd');
    expect(ids(reorder(els, new Set(['c']), 'back'))).toBe('cabd');
  });

  it('an order op reproduces the new order and undoes cleanly', () => {
    const s = new BoardStore();
    s.addElements(['a', 'b', 'c', 'd'].map((id, i) => dot(id, i)));
    const after = reorder(s.page.elements, new Set(['a', 'c']), 'front');
    s.commit(orderOp(s.page.id, s.page.elements, after));
    expect(ids(s.page.elements)).toBe('bdac');
    s.undo();
    expect(ids(s.page.elements)).toBe('abcd');
  });

  it('treats groups as units', () => {
    const els = [dot('a', 0, 0, 'g'), dot('b', 100, 0, 'g'), dot('c', 300, 40)];
    expect([...expandGroups(els, ['a'])].sort()).toEqual(['a', 'b']);
    const units = selectionUnits(els, new Set(['a', 'b', 'c']));
    expect(units.map((u) => u.length)).toEqual([2, 1]);
    const moved = alignUnits(units, 'left');
    expect(moved.map((e) => e.id)).toEqual(['c']);
    expect(elementBounds(moved[0]).x).toBe(-5);
  });

  it('distributes with equal gaps', () => {
    const els = [dot('a', 0), dot('b', 10), dot('c', 100)];
    const moved = distributeUnits(selectionUnits(els, new Set(['a', 'b', 'c'])), 'x');
    expect(moved).toHaveLength(1);
    expect((moved[0] as { x: number }).x).toBe(50);
  });

  it('segment erase splits a stroke and keeps its z-position', () => {
    const pts: number[] = [];
    for (let x = 0; x <= 100; x += 2) pts.push(x, 0, 0.5);
    const st: StrokeElement = { id: 's', type: 'stroke', tool: 'pen', points: pts, color: 'label', size: 2, pressure: false };
    const pieces = eraseStrokeSegment(st, 50, -10, 50, 10, 4)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0].points[pieces[0].points.length - 3]).toBeLessThan(46);
    expect(pieces[1].points[0]).toBeGreaterThan(54);
    expect(eraseStrokeSegment(st, 50, 40, 60, 40, 4)).toBeNull();

    const s = new BoardStore();
    s.addElements([dot('a', 0), st, dot('b', 0)]);
    s.commit(replaceWithPieces(s.page.id, s.page.elements, new Map([['s', pieces]])));
    expect(s.page.elements.map((e) => e.type)).toEqual(['dot', 'stroke', 'stroke', 'dot']);
    s.undo();
    expect(ids(s.page.elements)).toBe('asb');
  });

  it('segment erase cuts long straight spans of optimized strokes', () => {
    const st: StrokeElement = { id: 's', type: 'stroke', tool: 'pen', points: [0, 0, 0.5, 200, 0, 0.5], color: 'label', size: 2, pressure: true };
    expect(eraseStrokeSegment(st, 100, -5, 100, 5, 3)).toHaveLength(2);
  });

  it('optimizes stroke points without losing corners', () => {
    const pts: number[] = [];
    for (let x = 0; x <= 100; x += 0.5) pts.push(x, 0, 0.5);
    for (let y = 0.5; y <= 100; y += 0.5) pts.push(100, y, 0.5);
    const out = optimizePoints(pts, 0.2);
    expect(out.length / 3).toBe(3);
    expect(out.slice(3, 5)).toEqual([100, 0]);
  });
});
