import { jsonrepair } from 'jsonrepair';
import {
  isInteger,
  isLosslessNumber,
  isSafeNumber,
  parse as losslessParse,
  stringify as losslessStringify,
} from 'lossless-json';
import { offsetToLineColumn, stripBom } from '../text';
import type { FormatAdapter, ParseError } from './types';

export type JsonIndent = 2 | 4 | '\t' | 0;
export interface JsonStringifyOptions {
  indent?: JsonIndent;
  sortKeys?: boolean;
}
export type RepairResult = { ok: true; text: string } | { ok: false; error: ParseError };

/** lossless-json keeps numbers as LosslessNumber so big integers and long decimals survive. */
export const losslessJsonParser = { parse: losslessParse, stringify: losslessStringify };

// lossless-json and jsonrepair both end their messages with "at position N" (0-based).
const POSITION = /position (\d+)/;

function toParseError(source: string, err: unknown): ParseError {
  const message = err instanceof Error ? err.message : String(err);
  const match = POSITION.exec(message);
  return match ? { message, ...offsetToLineColumn(source, Number(match[1])) } : { message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isLosslessNumber(value)
  );
}

/** Assigns without triggering the __proto__ setter, so a "__proto__" key is kept as data. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) setOwn(out, key, sortKeysDeep(value[key]));
  return out;
}

export function countNodes(value: unknown): number {
  let count = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    count++;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else if (isPlainObject(current)) {
      for (const key of Object.keys(current)) stack.push(current[key]);
    }
  }
  return count;
}

export function toPlainValue(value: unknown, numbers: 'exact' | 'approximate' = 'exact'): unknown {
  if (isLosslessNumber(value)) {
    const literal = value.value;
    if (numbers === 'approximate' || isSafeNumber(literal)) return Number(literal);
    return isInteger(literal) ? BigInt(literal) : literal;
  }
  if (Array.isArray(value)) return value.map((item) => toPlainValue(item, numbers));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) setOwn(out, key, toPlainValue(value[key], numbers));
  return out;
}

export const jsonAdapter: FormatAdapter<JsonStringifyOptions> = {
  id: 'json',
  label: 'JSON',
  parse(text) {
    const source = stripBom(text);
    if (source.trim() === '') {
      return { ok: false, error: { message: 'Document is empty', line: 1, column: 1 } };
    }
    try {
      return { ok: true, value: losslessParse(source) };
    } catch (err) {
      return { ok: false, error: toParseError(source, err) };
    }
  },
  stringify(value, opts = {}) {
    const { indent = 2, sortKeys = false } = opts;
    const input = sortKeys ? sortKeysDeep(value) : value;
    return losslessStringify(input, null, indent === 0 ? undefined : indent) ?? '';
  },
};

export function repairJson(text: string): RepairResult {
  const source = stripBom(text);
  try {
    return { ok: true, text: jsonrepair(source) };
  } catch (err) {
    return { ok: false, error: toParseError(source, err) };
  }
}
