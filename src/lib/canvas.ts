// Canvas layout: creations drawn as a tree, an edit to the right of the result
// it modified. Pure, so the layout is unit-tested without a browser.
//
// Rules:
// - depth from the root is the column; each leaf takes the next free row and a
//   parent sits on its first child's row, so no two nodes ever share a cell;
// - roots and siblings go oldest first, whatever order the input arrives in;
// - a node whose parent is not in the input is a root. That happens when the
//   parent was deleted (`on delete set null` already clears it) or is older
//   than the page window the server loaded;
// - a cycle cannot come from the database (a source must exist before its
//   edit), but if one arrives its nodes are still placed exactly once.

export interface CanvasNodeInput {
  id: string;
  sourceCreationId: string | null;
  createdAt: string;
}

export interface CanvasLayout {
  cells: Map<string, { col: number; row: number }>;
  edges: { from: string; to: string }[];
  cols: number;
  rows: number;
}

export function layoutCanvas(nodes: readonly CanvasNodeInput[]): CanvasLayout {
  const ordered = [...nodes].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const ids = new Set(ordered.map((n) => n.id));
  const children = new Map<string, string[]>();
  for (const n of ordered) {
    const parent = n.sourceCreationId;
    if (parent && parent !== n.id && ids.has(parent)) {
      children.set(parent, [...(children.get(parent) ?? []), n.id]);
    }
  }
  const isRoot = (n: CanvasNodeInput) =>
    !n.sourceCreationId || n.sourceCreationId === n.id || !ids.has(n.sourceCreationId);

  const cells = new Map<string, { col: number; row: number }>();
  const edges: { from: string; to: string }[] = [];
  let nextRow = 0;
  let cols = 0;

  // Iterative DFS: a long edit chain must not overflow the call stack.
  const place = (rootId: string) => {
    const stack: { id: string; col: number }[] = [{ id: rootId, col: 0 }];
    const seen = new Set<string>([rootId]);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = (children.get(top.id) ?? []).find((k) => !seen.has(k) && !cells.has(k));
      if (next) {
        seen.add(next);
        edges.push({ from: top.id, to: next });
        stack.push({ id: next, col: top.col + 1 });
        continue;
      }
      stack.pop();
      const firstChild = (children.get(top.id) ?? []).map((k) => cells.get(k)).find(Boolean);
      const row = firstChild && firstChild.col === top.col + 1 ? firstChild.row : nextRow++;
      cells.set(top.id, { col: top.col, row });
      cols = Math.max(cols, top.col + 1);
    }
  };

  for (const n of ordered) if (isRoot(n) && !cells.has(n.id)) place(n.id);
  // Anything still unplaced sits on a cycle with no root; start from its oldest node.
  for (const n of ordered) if (!cells.has(n.id)) place(n.id);

  return { cells, edges, cols, rows: nextRow };
}
