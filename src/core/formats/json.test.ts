import { isLosslessNumber } from 'lossless-json';
import { describe, expect, it, vi } from 'vitest';
import { countNodes, jsonAdapter, repairJson, sortKeysDeep, toPlainValue } from './json';

const parseValue = (text: string) => {
  const r = jsonAdapter.parse(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('jsonAdapter.parse', () => {
  it('parses objects, arrays, and top-level scalars', () => {
    expect(jsonAdapter.parse('{"a":[1,2]}').ok).toBe(true);
    expect(toPlainValue(parseValue('"hello"'))).toBe('hello');
    expect(toPlainValue(parseValue('42'))).toBe(42);
    expect(parseValue('null')).toBeNull();
  });

  it('accepts a leading BOM (Review Focus 2)', () => {
    expect(jsonAdapter.parse('﻿{"a":1}').ok).toBe(true);
  });

  it('reports empty input as an error at 1:1', () => {
    expect(jsonAdapter.parse('   \n')).toEqual({
      ok: false,
      error: { message: 'Document is empty', line: 1, column: 1 },
    });
  });

  it('reports the line and column of a syntax error', () => {
    const r = jsonAdapter.parse('{\n  "a": 1\n  "b": 2\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject({ line: 3, column: 3 });
      expect(r.error.message).not.toBe('');
    }
  });

  it('reports a trailing comma', () => {
    const r = jsonAdapter.parse('{"a":1,}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ line: 1, column: 8 });
  });

  it('rejects duplicate keys with different values', () => {
    const r = jsonAdapter.parse('{"a":1,"a":2}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Duplicate key/);
  });

  it('never throws', () => {
    for (const bad of ['{', ']', '{"a":}', 'nul', '"\\x"', '\u0000']) {
      expect(() => jsonAdapter.parse(bad)).not.toThrow();
      expect(jsonAdapter.parse(bad).ok).toBe(false);
    }
  });
});

describe('jsonAdapter.stringify', () => {
  const value = () => parseValue('{"b":1,"a":[1,2]}');

  it('formats with 2 spaces by default, 4 spaces, tabs, or minified', () => {
    expect(jsonAdapter.stringify(value())).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(jsonAdapter.stringify(value(), { indent: 4 })).toContain('\n    "b": 1');
    expect(jsonAdapter.stringify(value(), { indent: '\t' })).toContain('\n\t"b": 1');
    expect(jsonAdapter.stringify(value(), { indent: 0 })).toBe('{"b":1,"a":[1,2]}');
  });

  it('sorts keys recursively when asked', () => {
    expect(
      jsonAdapter.stringify(parseValue('{"b":{"d":1,"c":2},"a":0}'), { indent: 0, sortKeys: true }),
    ).toBe('{"a":0,"b":{"c":2,"d":1}}');
  });

  it('preserves big integers and high-precision decimals exactly (Review Focus 1)', () => {
    const text = '{"id":12345678901234567890,"pi":3.141592653589793238462643383279}';
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0 })).toBe(text);
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0, sortKeys: true })).toBe(text);
  });

  it('preserves unicode, escapes, and a "__proto__" key', () => {
    const text = '{"__proto__":1,"emoji":"😀","esc":"line\\nbreak \\"q\\""}';
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0 })).toBe(text);
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0, sortKeys: true })).toBe(text);
  });
});

describe('repairJson', () => {
  it('repairs common breakage', () => {
    expect(repairJson("{'a': 1, b: [1,2,],}")).toEqual({ ok: true, text: '{"a": 1, "b": [1,2]}' });
  });

  it('returns a positioned error when repair is impossible', async () => {
    vi.resetModules();
    vi.doMock('jsonrepair', async () => {
      const actual = await vi.importActual<typeof import('jsonrepair')>('jsonrepair');
      return {
        ...actual,
        jsonrepair: () => {
          throw new actual.JSONRepairError('Colon expected', 4);
        },
      };
    });
    const { repairJson: mockedRepair } = await import('./json');
    expect(mockedRepair('{"a" 1}')).toEqual({
      ok: false,
      error: { message: 'Colon expected at position 4', line: 1, column: 5 },
    });
    vi.doUnmock('jsonrepair');
  });
});

describe('sortKeysDeep', () => {
  it('keeps arrays in order and leaves numbers intact', () => {
    const sorted = sortKeysDeep(parseValue('[{"b":1,"a":2},3]')) as [
      Record<string, unknown>,
      unknown,
    ];
    expect(Object.keys(sorted[0])).toEqual(['a', 'b']);
    expect(isLosslessNumber(sorted[1])).toBe(true);
  });
});

describe('countNodes', () => {
  it('counts every value including containers', () => {
    expect(countNodes(parseValue('{"a":[1,2,{"b":null}]}'))).toBe(6);
    expect(countNodes(parseValue('1'))).toBe(1);
  });
});

describe('toPlainValue', () => {
  it('converts numbers exactly or approximately', () => {
    const v = parseValue('[1.5, 12345678901234567890, 1e400]');
    expect(toPlainValue(v)).toEqual([1.5, 12345678901234567890n, '1e400']);
    expect(toPlainValue(v, 'approximate')).toEqual([1.5, Number('12345678901234567890'), Infinity]);
  });
});
