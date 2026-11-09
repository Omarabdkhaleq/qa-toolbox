import { describe, expect, it } from 'vitest';
import { pathOn, structuralDiff, summarizeChanges } from './structural';

describe('structuralDiff', () => {
  it('returns no changes for equal values regardless of key order', () => {
    expect(structuralDiff({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([]);
  });

  it('reports added, removed, and changed object keys', () => {
    const changes = structuralDiff(
      { a: 1, gone: true, nested: { x: 'old' } },
      { a: 2, nested: { x: 'new' }, fresh: null },
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: 'changed', path: ['a'], before: 1, after: 2 },
        { kind: 'removed', path: ['gone'], before: true },
        { kind: 'changed', path: ['nested', 'x'], before: 'old', after: 'new' },
        { kind: 'added', path: ['fresh'], after: null },
      ]),
    );
    expect(changes).toHaveLength(4);
  });

  it('reports a root-level change', () => {
    expect(structuralDiff(1, 'one')).toEqual([
      { kind: 'changed', path: [], before: 1, after: 'one' },
    ]);
  });

  it('matches array objects by id, so reordering is a move (Review Focus 5)', () => {
    const left = [
      { id: 1, n: 'a' },
      { id: 2, n: 'b' },
      { id: 3, n: 'c' },
    ];
    const right = [
      { id: 3, n: 'c' },
      { id: 1, n: 'a' },
      { id: 2, n: 'b' },
    ];
    const summary = summarizeChanges(structuralDiff(left, right));
    expect(summary.changed).toBe(0);
    expect(summary.moved).toBeGreaterThan(0);
  });

  it('reports an inserted array element as one addition', () => {
    expect(structuralDiff([1, 2, 3], [0, 1, 2, 3])).toEqual([
      { kind: 'added', path: [0], after: 0 },
    ]);
  });

  it('compares bigints by value', () => {
    expect(structuralDiff({ id: 12345678901234567890n }, { id: 12345678901234567890n })).toEqual(
      [],
    );
    expect(
      structuralDiff({ id: 12345678901234567890n }, { id: 12345678901234567891n }),
    ).toHaveLength(1);
  });

  it('keeps a user key named "_t"', () => {
    expect(structuralDiff({ _t: 1 }, { _t: 2 })).toEqual([
      { kind: 'changed', path: ['_t'], before: 1, after: 2 },
    ]);
  });
});

describe('summarizeChanges', () => {
  it('counts by kind', () => {
    expect(
      summarizeChanges([
        { kind: 'added', path: [], after: 1 },
        { kind: 'added', path: [], after: 2 },
        { kind: 'moved', path: [0], toIndex: 1 },
      ]),
    ).toEqual({ added: 2, removed: 0, changed: 0, moved: 1 });
  });
});

describe('structuralDiff left and right paths inside arrays', () => {
  it('maps a change after an insertion back to its left index', () => {
    const changes = structuralDiff(
      {
        items: [
          { id: 1, n: 'a' },
          { id: 2, n: 'b' },
        ],
      },
      { items: [{ id: 0 }, { id: 1, n: 'a' }, { id: 2, n: 'B' }] },
    );
    const changed = changes.find((c) => c.kind === 'changed')!;
    expect(changed.path).toEqual(['items', 2, 'n']);
    expect(pathOn(changed, 'right')).toEqual(['items', 2, 'n']);
    expect(pathOn(changed, 'left')).toEqual(['items', 1, 'n']);
  });

  it('maps a change after a removal back to its left index', () => {
    const changes = structuralDiff(
      [
        { id: 1, n: 'a' },
        { id: 2, n: 'b' },
      ],
      [{ id: 2, n: 'B' }],
    );
    const changed = changes.find((c) => c.kind === 'changed')!;
    const removed = changes.find((c) => c.kind === 'removed')!;
    expect(pathOn(changed, 'left')).toEqual([1, 'n']);
    expect(pathOn(changed, 'right')).toEqual([0, 'n']);
    expect(pathOn(removed, 'left')).toEqual([0]);
  });

  it('follows a moved and modified item on both sides', () => {
    const changes = structuralDiff(
      [
        { id: 1, n: 'a' },
        { id: 2, n: 'b' },
        { id: 3, n: 'c' },
      ],
      [
        { id: 3, n: 'C' },
        { id: 1, n: 'a' },
        { id: 2, n: 'b' },
      ],
    );
    const moved = changes.find((c) => c.kind === 'moved')!;
    const changed = changes.find((c) => c.kind === 'changed')!;
    expect(pathOn(moved, 'left')).toEqual([2]);
    expect(pathOn(moved, 'right')).toEqual([0]);
    expect(pathOn(changed, 'left')).toEqual([2, 'n']);
    expect(pathOn(changed, 'right')).toEqual([0, 'n']);
  });

  it('maps an unmoved item past moves and removals on both sides', () => {
    // Left [1,2,3,4] → right [4,1,3,2'] : 4 and 3 move, 2 changes in place.
    const changes = structuralDiff(
      [
        { id: 1, n: 'a' },
        { id: 2, n: 'b' },
        { id: 3, n: 'c' },
        { id: 4, n: 'd' },
      ],
      [
        { id: 4, n: 'd' },
        { id: 1, n: 'a' },
        { id: 3, n: 'c' },
        { id: 2, n: 'B' },
      ],
    );
    const changed = changes.find((c) => c.kind === 'changed')!;
    expect(pathOn(changed, 'left')).toEqual([1, 'n']);
    expect(pathOn(changed, 'right')).toEqual([3, 'n']);
  });

  it('maps nested arrays level by level (the review repro)', () => {
    const changes = structuralDiff(
      {
        items: [
          { id: 1, n: 'a' },
          { id: 2, n: 'b', tags: ['x', 'y'] },
          { id: 4, n: 'd' },
        ],
      },
      {
        items: [
          { id: 3, n: 'c' },
          { id: 1, n: 'a' },
          { id: 2, n: 'B', tags: ['y'] },
        ],
      },
    );
    const byKind = (kind: string, last: string | number) =>
      changes.find((c) => c.kind === kind && c.path[c.path.length - 1] === last)!;
    expect(pathOn(byKind('changed', 'n'), 'left')).toEqual(['items', 1, 'n']);
    expect(pathOn(byKind('changed', 'n'), 'right')).toEqual(['items', 2, 'n']);
    expect(pathOn(byKind('removed', 0), 'left')).toEqual(['items', 1, 'tags', 0]);
    expect(pathOn(byKind('removed', 0), 'right').slice(0, -1)).toEqual(['items', 2, 'tags']);
    expect(pathOn(byKind('removed', 2), 'left')).toEqual(['items', 2]);
    expect(pathOn(byKind('added', 0), 'right')).toEqual(['items', 0]);
    expect(pathOn(byKind('added', 0), 'left').slice(0, -1)).toEqual(['items']);
  });

  it('falls back to path (and toIndex for moves) when no side path is recorded', () => {
    expect(pathOn({ kind: 'changed', path: ['a'], before: 1, after: 2 }, 'left')).toEqual(['a']);
    expect(pathOn({ kind: 'moved', path: ['l', 0], toIndex: 2 }, 'right')).toEqual(['l', 2]);
    expect(pathOn({ kind: 'moved', path: ['l', 0], toIndex: 2 }, 'left')).toEqual(['l', 0]);
  });
});
