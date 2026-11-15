import { describe, expect, it } from 'vitest';
import { classForPath, lineRangesFor, type PathHighlights } from './highlights';

const text = '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}';
const map: PathHighlights = new Map([
  ['/b/c', 'changed'],
  ['/b', 'ancestor'],
  ['/a', 'removed'],
]);

describe('lineRangesFor', () => {
  it('maps highlighted pointers to sorted line ranges and skips ancestors', () => {
    expect(lineRangesFor(text, map)).toEqual([
      { fromLine: 2, toLine: 2, kind: 'removed' },
      { fromLine: 4, toLine: 4, kind: 'changed' },
    ]);
  });

  it('spans multi-line values from the key line to the value end', () => {
    expect(lineRangesFor(text, new Map([['/b', 'added']]))).toEqual([
      { fromLine: 3, toLine: 5, kind: 'added' },
    ]);
  });

  it('uses the value line for array items and the root', () => {
    const arr = '[\n  1,\n  2\n]';
    expect(
      lineRangesFor(
        arr,
        new Map([
          ['/1', 'moved'],
          ['', 'changed'],
        ]),
      ),
    ).toEqual([
      { fromLine: 1, toLine: 4, kind: 'changed' },
      { fromLine: 3, toLine: 3, kind: 'moved' },
    ]);
  });

  it('ignores unknown pointers and unparsable text', () => {
    expect(lineRangesFor(text, new Map([['/zz', 'added']]))).toEqual([]);
    expect(lineRangesFor('{oops', map)).toEqual([]);
  });
});

describe('classForPath', () => {
  it('returns the highlight class', () => {
    expect(classForPath(['b', 'c'], map)).toBe('jt-hl jt-hl--changed');
  });
  it('returns undefined for unknown paths', () => {
    expect(classForPath(['nope'], map)).toBeUndefined();
  });
  it('returns the ancestor class for ancestors', () => {
    expect(classForPath(['b'], map)).toBe('jt-hl jt-hl--ancestor');
  });
});
