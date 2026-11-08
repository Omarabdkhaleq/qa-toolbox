import { describe, expect, it } from 'vitest';
import { compareJson, lineOfPath, sideOfChange, summaryText } from './logic';

const compare = (left: string, right: string, ignoreKeyOrder = true) =>
  compareJson({ left, right, options: { ignoreKeyOrder } });

describe('compareJson', () => {
  it('asks for input when a side is empty (Review Focus 4)', () => {
    const result = compare('', '{"a":1}');
    expect(result).toEqual({ ok: false, left: { kind: 'empty' }, right: null });
    expect(summaryText(result)).toBe('Paste JSON on both sides to compare');
  });

  it('reports invalid sides with their parse errors', () => {
    const result = compare('{"a":', '{"a":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.left).toMatchObject({ kind: 'invalid', error: { line: 1 } });
    expect(summaryText(result)).toBe('Fix the JSON errors to compare');
  });

  it('says identical when only formatting and key order differ (Review Focus 5)', () => {
    const result = compare('{"a":1,"b":[1,2]}', '{\n  "b": [1, 2],\n  "a": 1\n}');
    expect(result.ok && result.changes).toEqual([]);
    expect(summaryText(result)).toBe('No differences');
  });

  it('distinguishes data-equal but text-different documents', () => {
    expect(summaryText(compare('{"a":1,"b":2}', '{"b":2,"a":1}', false))).toBe(
      'Same data — key order or number notation differs',
    );
    expect(summaryText(compare('{"a":1.0}', '{"a":1}'))).toBe(
      'Same data — key order or number notation differs',
    );
  });

  it('normalizes both sides to 2-space JSON, sorted when ignoring key order', () => {
    const result = compare('{"b":1,"a":2}', '{"a":2}');
    if (!result.ok) throw new Error('expected ok');
    expect(result.leftText).toBe('{\n  "a": 2,\n  "b": 1\n}');
    expect(result.rightText).toBe('{\n  "a": 2\n}');
  });

  it('summarizes changes with correct plurals', () => {
    expect(summaryText(compare('{"a":1}', '{"a":2}'))).toBe(
      '1 change: 0 added, 0 removed, 1 changed, 0 moved',
    );
    expect(summaryText(compare('{"a":1}', '{"a":2,"b":3}'))).toBe(
      '2 changes: 1 added, 0 removed, 1 changed, 0 moved',
    );
  });

  it('detects a one-digit change in a big integer (Review Focus 1)', () => {
    const result = compare('{"id":12345678901234567890}', '{"id":12345678901234567891}');
    expect(result.ok && result.changes).toEqual([
      {
        kind: 'changed',
        path: ['id'],
        before: 12345678901234567890n,
        after: 12345678901234567891n,
      },
    ]);
  });
});

describe('summaryText', () => {
  it('handles the pending state', () => {
    expect(summaryText(null)).toBe('Comparing…');
  });
});

describe('lineOfPath', () => {
  const text = '{\n  "a": 1,\n  "users": [\n    {\n      "email": "x"\n    }\n  ]\n}';
  it('finds the 1-based line of a path', () => {
    expect(lineOfPath(text, [])).toBe(1);
    expect(lineOfPath(text, ['a'])).toBe(2);
    expect(lineOfPath(text, ['users', 0, 'email'])).toBe(5);
  });
  it('returns undefined for missing paths or invalid text', () => {
    expect(lineOfPath(text, ['nope'])).toBeUndefined();
    expect(lineOfPath('{', ['a'])).toBeUndefined();
  });
});

describe('sideOfChange', () => {
  it('locates removals and moves on the left, others on the right', () => {
    expect(sideOfChange({ kind: 'removed', path: [], before: 1 })).toBe('left');
    expect(sideOfChange({ kind: 'moved', path: [0], toIndex: 1 })).toBe('left');
    expect(sideOfChange({ kind: 'added', path: [], after: 1 })).toBe('right');
    expect(sideOfChange({ kind: 'changed', path: [], before: 1, after: 2 })).toBe('right');
  });
});
