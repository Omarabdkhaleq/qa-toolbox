import jsonMap from 'json-source-map';
import { isLosslessNumber } from 'lossless-json';
import { NumberLiteral } from '../../core/diff/numberLiteral';
import { toJsonPointer, type PathSegment } from '../../core/diff/paths';
import {
  structuralDiff,
  summarizeChanges,
  type Change,
  type DiffSide,
} from '../../core/diff/structural';
import { describeParseError } from '../../core/formats/errors';
import {
  countNodes,
  jsonAdapter,
  repairJson,
  toPlainValue,
  type JsonIndent,
} from '../../core/formats/json';
import type { ParseError } from '../../core/formats/types';
import type { HighlightKind, PathHighlights } from '../../core/json-view/highlights';
import { formatBytes, utf8ByteLength } from '../../core/text';

export type EditorStatus =
  | { state: 'empty' }
  | { state: 'valid'; bytes: number; nodes: number }
  | { state: 'invalid'; bytes: number; error: ParseError };

export function computeStatus(text: string): EditorStatus {
  if (text.trim() === '') return { state: 'empty' };
  const bytes = utf8ByteLength(text);
  const result = jsonAdapter.parse(text);
  return result.ok
    ? { state: 'valid', bytes, nodes: countNodes(result.value) }
    : { state: 'invalid', bytes, error: result.error };
}

export function statusLabel(status: EditorStatus): string {
  switch (status.state) {
    case 'empty':
      return 'Empty — paste, type, or drop a JSON file';
    case 'valid':
      return `Valid JSON · ${formatBytes(status.bytes)} · ${status.nodes.toLocaleString('en-US')} nodes`;
    case 'invalid':
      return `Invalid JSON: ${describeParseError(status.error)}`;
  }
}

export type IndentChoice = Exclude<JsonIndent, 0>;

export function parseIndentChoice(value: string): IndentChoice {
  if (value === '4') return 4;
  if (value === 'tab') return '\t';
  return 2;
}

export type EditAction =
  | { kind: 'format'; indent: IndentChoice }
  | { kind: 'minify' }
  | { kind: 'sortKeys'; indent: IndentChoice }
  | { kind: 'repair' };

export type EditResult = { ok: true; text: string } | { ok: false; error: ParseError };

export function applyEdit(text: string, action: EditAction): EditResult {
  if (action.kind === 'repair') return repairJson(text);
  const parsed = jsonAdapter.parse(text);
  if (!parsed.ok) return parsed;
  switch (action.kind) {
    case 'format':
      return { ok: true, text: jsonAdapter.stringify(parsed.value, { indent: action.indent }) };
    case 'minify':
      return { ok: true, text: jsonAdapter.stringify(parsed.value, { indent: 0 }) };
    case 'sortKeys':
      return {
        ok: true,
        text: jsonAdapter.stringify(parsed.value, { indent: action.indent, sortKeys: true }),
      };
  }
}

export interface CompareInput {
  left: string;
  right: string;
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

export function compareJson({ left, right }: CompareInput): CompareResult {
  const l = parseSide(left);
  const r = parseSide(right);
  if ('issue' in l || 'issue' in r) {
    return { ok: false, left: 'issue' in l ? l.issue : null, right: 'issue' in r ? r.issue : null };
  }
  const opts = { indent: 2 as const, sortKeys: true };
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

export interface SideTarget {
  /** Path to outline; null when the change has no value on this side. */
  focus: readonly PathSegment[] | null;
  /** Path to scroll to; the parent of an absent value, or null for a top-level one. */
  scroll: readonly PathSegment[] | null;
}

/** Where a change sits in each editor. */
export function changeTargets(change: Change): Record<DiffSide, SideTarget> {
  const at = (path: readonly PathSegment[]): SideTarget => ({ focus: path, scroll: path });
  const near: SideTarget = {
    focus: null,
    scroll: change.path.length > 1 ? change.path.slice(0, -1) : null,
  };
  switch (change.kind) {
    case 'removed':
      return { left: at(change.path), right: near };
    case 'added':
      return { left: near, right: at(change.path) };
    case 'changed':
      return { left: at(change.path), right: at(change.path) };
    case 'moved':
      return { left: at(change.path), right: at([...change.path.slice(0, -1), change.toIndex]) };
  }
}

export function compareAvailability(
  left: EditorStatus,
  right: EditorStatus,
):
  | { ok: true }
  | {
      ok: false;
      reason: 'Paste JSON on both sides to compare' | 'Fix the JSON errors to compare';
    } {
  if (left.state === 'empty' || right.state === 'empty') {
    return { ok: false, reason: 'Paste JSON on both sides to compare' };
  }
  if (left.state === 'invalid' || right.state === 'invalid') {
    return { ok: false, reason: 'Fix the JSON errors to compare' };
  }
  return { ok: true };
}

export const MAX_HIGHLIGHTED_CHANGES = 10_000;

export function highlightsFor(changes: readonly Change[]): {
  left: PathHighlights;
  right: PathHighlights;
  total: number;
  truncated: boolean;
} {
  const left = new Map<string, HighlightKind>();
  const right = new Map<string, HighlightKind>();
  const ancestorsLeft: (readonly PathSegment[])[] = [];
  const ancestorsRight: (readonly PathSegment[])[] = [];
  for (const change of changes.slice(0, MAX_HIGHLIGHTED_CHANGES)) {
    switch (change.kind) {
      case 'removed':
        left.set(toJsonPointer(change.path), 'removed');
        ancestorsLeft.push(change.path);
        break;
      case 'added':
        right.set(toJsonPointer(change.path), 'added');
        ancestorsRight.push(change.path);
        break;
      case 'changed':
        left.set(toJsonPointer(change.path), 'changed');
        right.set(toJsonPointer(change.path), 'changed');
        ancestorsLeft.push(change.path);
        ancestorsRight.push(change.path);
        break;
      case 'moved': {
        const target = [...change.path.slice(0, -1), change.toIndex];
        left.set(toJsonPointer(change.path), 'moved');
        right.set(toJsonPointer(target), 'moved');
        ancestorsLeft.push(change.path);
        ancestorsRight.push(target);
        break;
      }
    }
  }
  addAncestors(left, ancestorsLeft);
  addAncestors(right, ancestorsRight);
  return {
    left,
    right,
    total: changes.length,
    truncated: changes.length > MAX_HIGHLIGHTED_CHANGES,
  };
}

function addAncestors(map: Map<string, HighlightKind>, paths: readonly (readonly PathSegment[])[]) {
  for (const path of paths) {
    for (let n = 1; n < path.length; n++) {
      const pointer = toJsonPointer(path.slice(0, n));
      if (!map.has(pointer)) map.set(pointer, 'ancestor');
    }
  }
}

const SNAP_CLOSED_PERCENT = 15;
const MIN_OPEN_PANE_PX = 240;

/** Split position (percent for the left pane) from a pointer x within a container. */
export function splitFromPointer(xPx: number, widthPx: number): number {
  if (widthPx <= 0) return 50;
  const percent = (xPx / widthPx) * 100;
  if (percent < SNAP_CLOSED_PERCENT) return 0;
  if (percent > 100 - SNAP_CLOSED_PERCENT) return 100;
  const minPercent = Math.min((MIN_OPEN_PANE_PX / widthPx) * 100, 50);
  return Math.min(100 - minPercent, Math.max(minPercent, percent));
}

export function splitFromKey(
  current: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'Enter',
): number {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, current - 5);
    case 'ArrowRight':
      return Math.min(100, current + 5);
    case 'Home':
      return 0;
    case 'End':
      return 100;
    case 'Enter':
      return 50;
  }
}
