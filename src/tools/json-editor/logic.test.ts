import { describe, expect, it } from 'vitest';
import { applyEdit, computeStatus, parseIndentChoice, statusLabel } from './logic';

describe('computeStatus', () => {
  it('is empty for blank input, not an error (Review Focus 4)', () => {
    expect(computeStatus('  \n ')).toEqual({ state: 'empty' });
    expect(statusLabel({ state: 'empty' })).toBe('Empty — paste, type, or drop a JSON file');
  });

  it('reports size and node count for valid JSON', () => {
    const status = computeStatus('{"a":[1,2]}');
    expect(status).toEqual({ state: 'valid', bytes: 11, nodes: 4 });
    expect(statusLabel(status)).toBe('Valid JSON · 11 B · 4 nodes');
  });

  it('reports the parse error position', () => {
    const status = computeStatus('{"a":1,}');
    expect(status.state).toBe('invalid');
    expect(statusLabel(status)).toMatch(/^Invalid JSON: .+ \(line 1, column 8\)$/);
  });
});

describe('parseIndentChoice', () => {
  it('maps select values', () => {
    expect(parseIndentChoice('2')).toBe(2);
    expect(parseIndentChoice('4')).toBe(4);
    expect(parseIndentChoice('tab')).toBe('\t');
    expect(parseIndentChoice('nonsense')).toBe(2);
  });
});

describe('applyEdit', () => {
  it('formats with the chosen indentation', () => {
    expect(applyEdit('[1]', { kind: 'format', indent: 4 })).toEqual({
      ok: true,
      text: '[\n    1\n]',
    });
  });

  it('minifies', () => {
    expect(applyEdit('{ "a" : [ 1 ] }', { kind: 'minify' })).toEqual({
      ok: true,
      text: '{"a":[1]}',
    });
  });

  it('sorts keys recursively and keeps big numbers (Review Focus 1)', () => {
    const r = applyEdit('{"b":1,"a":{"d":[1,2],"c":12345678901234567890}}', {
      kind: 'sortKeys',
      indent: 2,
    });
    expect(r.ok && r.text).toBe(
      '{\n  "a": {\n    "c": 12345678901234567890,\n    "d": [\n      1,\n      2\n    ]\n  },\n  "b": 1\n}',
    );
  });

  it('repairs broken JSON', () => {
    expect(applyEdit("{a:'x',}", { kind: 'repair' })).toEqual({ ok: true, text: '{"a":"x"}' });
  });

  it('returns the parse error instead of formatting invalid JSON', () => {
    expect(applyEdit('{"a":', { kind: 'format', indent: 2 }).ok).toBe(false);
  });
});
