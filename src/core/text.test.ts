import { describe, expect, it } from 'vitest';
import { formatBytes, offsetToLineColumn, stripBom, utf8ByteLength } from './text';

describe('stripBom', () => {
  it('removes a leading BOM only', () => {
    expect(stripBom('﻿{"a":1}')).toBe('{"a":1}');
    expect(stripBom('{"a":"﻿"}')).toBe('{"a":"﻿"}');
  });
});

describe('offsetToLineColumn', () => {
  const text = '{\n  "a": 1\n  "b": 2\n}';
  it.each([
    [0, { line: 1, column: 1 }],
    [2, { line: 2, column: 1 }],
    [13, { line: 3, column: 3 }],
    [999, { line: 4, column: 2 }],
    [-5, { line: 1, column: 1 }],
  ])('offset %i', (offset, expected) => {
    expect(offsetToLineColumn(text, offset)).toEqual(expected);
  });
});

describe('utf8ByteLength', () => {
  it('counts multi-byte characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [20 * 1024 * 1024, '20 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('%i bytes', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
