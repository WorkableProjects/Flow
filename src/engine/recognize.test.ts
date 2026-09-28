import { describe, expect, it } from 'vitest';
import { recognize } from './recognize';

const flat = (pts: [number, number][]) => pts.flatMap(([x, y]) => [x, y, 0.5]);

const jitter = (i: number) => Math.sin(i * 12.9898) * 2;

describe('recognize', () => {
  it('detects a wobbly line', () => {
    const pts: [number, number][] = Array.from({ length: 40 }, (_, i) => [i * 10, i * 4 + jitter(i)]);
    expect(recognize(flat(pts))?.kind).toBe('line');
  });

  it('detects a circle', () => {
    const pts: [number, number][] = Array.from({ length: 64 }, (_, i) => {
      const a = (i / 63) * Math.PI * 2;
      return [200 + Math.cos(a) * (100 + jitter(i)), 200 + Math.sin(a) * (80 + jitter(i + 3))];
    });
    expect(recognize(flat(pts))?.kind).toBe('ellipse');
  });

  it('detects a rectangle', () => {
    const pts: [number, number][] = [];
    const edge = (ax: number, ay: number, bx: number, by: number) => {
      for (let t = 0; t < 1; t += 0.05) pts.push([ax + (bx - ax) * t + jitter(pts.length), ay + (by - ay) * t + jitter(pts.length + 1)]);
    };
    edge(0, 0, 300, 0); edge(300, 0, 300, 200); edge(300, 200, 0, 200); edge(0, 200, 0, 4);
    expect(recognize(flat(pts))?.kind).toBe('rect');
  });

  it('detects a triangle as a 3-point polygon', () => {
    const pts: [number, number][] = [];
    const edge = (ax: number, ay: number, bx: number, by: number) => {
      for (let t = 0; t < 1; t += 0.05) pts.push([ax + (bx - ax) * t, ay + (by - ay) * t + jitter(pts.length)]);
    };
    edge(150, 0, 300, 250); edge(300, 250, 0, 250); edge(0, 250, 148, 4);
    const r = recognize(flat(pts));
    expect(r?.kind).toBe('polygon');
    expect(r?.pts?.length).toBe(6);
  });

  it('ignores scribbles', () => {
    const pts: [number, number][] = Array.from({ length: 60 }, (_, i) => [i * 8, (i % 2) * 60]);
    expect(recognize(flat(pts))).toBeNull();
  });
});

import { regularize, straighten } from './recognize';

describe('shape clean-up', () => {
  it('straightens nearly horizontal lines, keeping length', () => {
    const r = straighten({ kind: 'line', x1: 0, y1: 0, x2: 100, y2: 5 });
    expect(r.y2).toBeCloseTo(0);
    expect(r.x2).toBeCloseTo(Math.hypot(100, 5));
    expect(straighten({ kind: 'line', x1: 0, y1: 0, x2: 100, y2: 30 }).y2).toBe(30);
  });

  it('turns near-circles into circles and near-squares into squares', () => {
    const c = regularize({ kind: 'ellipse', x1: 0, y1: 0, x2: 100, y2: 92 });
    expect(c.x2 - c.x1).toBeCloseTo(c.y2 - c.y1);
    const e = regularize({ kind: 'ellipse', x1: 0, y1: 0, x2: 100, y2: 60 });
    expect(e.y2).toBe(60);
  });
});
