import { describe, expect, it } from 'vitest';
import { structuralDiff, summarizeChanges } from './structural';

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
