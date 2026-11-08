import { isLosslessNumber } from 'lossless-json';
import jsonMap from 'json-source-map';
import { toJsonPointer, type PathSegment } from '../../core/diff/paths';
import {
  structuralDiff,
  summarizeChanges,
  type Change,
  type DiffSide,
} from '../../core/diff/structural';
import { NumberLiteral } from '../../core/diff/numberLiteral';
import { jsonAdapter, toPlainValue } from '../../core/formats/json';
import type { ParseError } from '../../core/formats/types';

export interface CompareOptions {
  ignoreKeyOrder: boolean;
}
export interface CompareInput {
  left: string;
  right: string;
  options: CompareOptions;
}
export type SideIssue = { kind: 'empty' } | { kind: 'invalid'; error: ParseError };
export type CompareResult =
  | { ok: true; leftText: string; rightText: string; changes: Change[] }
  | { ok: false; left: SideIssue | null; right: SideIssue | null };

type Side = { value: unknown } | { issue: SideIssue };

/** Like toPlainValue, but non-safe decimals become NumberLiteral so they never equal a string. */
function toCompareValue(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const plain = toPlainValue(value);
    return typeof plain === 'string' ? new NumberLiteral(value.value) : plain;
  }
  if (Array.isArray(value)) return value.map(toCompareValue);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // defineProperty keeps a "__proto__" key as plain data.
    Object.defineProperty(out, key, {
      value: toCompareValue(item),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

function parseSide(text: string): Side {
  if (text.trim() === '') return { issue: { kind: 'empty' } };
  const result = jsonAdapter.parse(text);
  return result.ok ? { value: result.value } : { issue: { kind: 'invalid', error: result.error } };
}

export function compareJson({ left, right, options }: CompareInput): CompareResult {
  const l = parseSide(left);
  const r = parseSide(right);
  if ('issue' in l || 'issue' in r) {
    return { ok: false, left: 'issue' in l ? l.issue : null, right: 'issue' in r ? r.issue : null };
  }
  const opts = { indent: 2 as const, sortKeys: options.ignoreKeyOrder };
  return {
    ok: true,
    leftText: jsonAdapter.stringify(l.value, opts),
    rightText: jsonAdapter.stringify(r.value, opts),
    changes: structuralDiff(toCompareValue(l.value), toCompareValue(r.value)),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `null` = still computing. */
export function summaryText(result: CompareResult | null): string {
  if (!result) return 'Comparing…';
  if (!result.ok) {
    const invalid = result.left?.kind === 'invalid' || result.right?.kind === 'invalid';
    return invalid ? 'Fix the JSON errors to compare' : 'Paste JSON on both sides to compare';
  }
  if (result.changes.length === 0) {
    return result.leftText === result.rightText
      ? 'No differences'
      : 'Same data — key order or number notation differs';
  }
  const s = summarizeChanges(result.changes);
  return `${plural(result.changes.length, 'change')}: ${s.added} added, ${s.removed} removed, ${s.changed} changed, ${s.moved} moved`;
}

/** 1-based line of `path` in normalized JSON text. */
export function lineOfPath(text: string, path: readonly PathSegment[]): number | undefined {
  try {
    const pointer = jsonMap.parse(text).pointers[toJsonPointer(path)];
    return pointer ? pointer.value.line + 1 : undefined;
  } catch {
    return undefined;
  }
}

export function sideOfChange(change: Change): DiffSide {
  return change.kind === 'removed' || change.kind === 'moved' ? 'left' : 'right';
}
