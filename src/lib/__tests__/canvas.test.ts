import { describe, expect, it } from 'vitest';
import { layoutCanvas, type CanvasNodeInput } from '../canvas';

// Minutes after a fixed instant, so creation order is explicit in each case.
const at = (m: number) => new Date(Date.UTC(2026, 10, 10, 12, m)).toISOString();
const node = (id: string, source: string | null, minute: number): CanvasNodeInput => ({
  id,
  sourceCreationId: source,
  createdAt: at(minute),
});

function cellsOf(nodes: CanvasNodeInput[]) {
  const layout = layoutCanvas(nodes);
  return { layout, cells: Object.fromEntries(layout.cells) };
}

function expectNoSharedCell(nodes: CanvasNodeInput[]) {
  const { layout } = cellsOf(nodes);
  const keys = [...layout.cells.values()].map((c) => `${c.col}:${c.row}`);
  expect(layout.cells.size).toBe(nodes.length);
  expect(new Set(keys).size).toBe(nodes.length);
}

describe('layoutCanvas', () => {
  it('places an edit chain left to right on one row', () => {
    const { layout, cells } = cellsOf([node('a', null, 0), node('b', 'a', 1), node('c', 'b', 2)]);
    expect(cells).toEqual({
      a: { col: 0, row: 0 },
      b: { col: 1, row: 0 },
      c: { col: 2, row: 0 },
    });
    expect(layout.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    expect(layout).toMatchObject({ cols: 3, rows: 1 });
  });

  it('stacks a fork, oldest branch first, and the parent sits on its first branch', () => {
    const { layout, cells } = cellsOf([
      node('r', null, 0),
      node('x', 'r', 1),
      node('y', 'r', 2),
      node('x2', 'x', 3),
      node('s', null, 4),
    ]);
    expect(cells).toEqual({
      r: { col: 0, row: 0 },
      x: { col: 1, row: 0 },
      x2: { col: 2, row: 0 },
      y: { col: 1, row: 1 },
      s: { col: 0, row: 2 },
    });
    expect(layout.edges).toHaveLength(3);
    expect(layout).toMatchObject({ cols: 3, rows: 3 });
  });

  it('gives the same layout for newest-first input (how the server lists them)', () => {
    const oldestFirst = [node('r', null, 0), node('x', 'r', 1), node('y', 'r', 2)];
    expect(cellsOf([...oldestFirst].reverse()).cells).toEqual(cellsOf(oldestFirst).cells);
    expect(cellsOf([...oldestFirst].reverse()).cells).toEqual({
      r: { col: 0, row: 0 },
      x: { col: 1, row: 0 },
      y: { col: 1, row: 1 },
    });
  });

  it('treats an edit whose source is not loaded as a root', () => {
    const { layout, cells } = cellsOf([node('e', 'gone', 0), node('f', 'e', 1)]);
    expect(cells).toEqual({ e: { col: 0, row: 0 }, f: { col: 1, row: 0 } });
    expect(layout.edges).toEqual([{ from: 'e', to: 'f' }]);
  });

  it('places every node once even for a self-reference or a cycle', () => {
    const { cells } = cellsOf([node('a', 'b', 0), node('b', 'a', 1), node('s', 's', 2)]);
    // s (self-reference) is an ordinary root; the rootless cycle is placed afterwards.
    expect(cells).toEqual({
      s: { col: 0, row: 0 },
      a: { col: 0, row: 1 },
      b: { col: 1, row: 1 },
    });
  });

  it('never puts two nodes in the same cell', () => {
    expectNoSharedCell([
      node('r1', null, 0),
      node('r2', null, 1),
      node('a', 'r1', 2),
      node('b', 'r1', 3),
      node('c', 'a', 4),
      node('d', 'r2', 5),
      node('e', 'c', 6),
      node('f', 'b', 7),
      node('g', 'missing', 8),
    ]);
  });

  it('handles an empty canvas and a long chain without recursion limits', () => {
    expect(layoutCanvas([])).toMatchObject({ cols: 0, rows: 0, edges: [] });
    const chain = Array.from({ length: 5000 }, (_, i) => node(`n${i}`, i ? `n${i - 1}` : null, i));
    const { cells } = layoutCanvas(chain);
    expect(cells.get('n4999')).toEqual({ col: 4999, row: 0 });
  });
});
