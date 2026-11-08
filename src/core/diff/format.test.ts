import { describe, expect, it } from 'vitest';
import { describeChange, formatValue } from './format';

describe('formatValue', () => {
  it('formats strings, bigints, objects, and truncates', () => {
    expect(formatValue('a')).toBe('"a"');
    expect(formatValue(12345678901234567890n)).toBe('12345678901234567890');
    expect(formatValue({ id: 1n, tags: ['x'] })).toBe('{"id":1,"tags":["x"]}');
    expect(formatValue(undefined)).toBe('undefined');
    expect(formatValue('x'.repeat(100), 10)).toBe('"xxxxxxxx…');
  });
});

describe('describeChange', () => {
  it('describes each kind', () => {
    expect(describeChange({ kind: 'added', path: ['a'], after: 1 })).toBe('1');
    expect(describeChange({ kind: 'removed', path: ['a'], before: 'x' })).toBe('"x"');
    expect(describeChange({ kind: 'changed', path: ['a'], before: 1, after: 2 })).toBe('1 → 2');
    expect(describeChange({ kind: 'moved', path: [0], toIndex: 3 })).toBe('to index 3');
  });
});
