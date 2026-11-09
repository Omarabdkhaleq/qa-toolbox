import { create, type DiffContext, type Filter } from 'jsondiffpatch';
import { NumberLiteral } from './numberLiteral';
import type { PathSegment } from './paths';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';
/**
 * Inside arrays the same item can sit at different indices on each side, so a change also
 * records where it sits in each document. Each is set only when it differs from `path`
 * (read them with `pathOn`). For a value absent on a side (added: left; removed: right) only
 * the parent part of that side's path is meaningful.
 */
interface SidePaths {
  leftPath?: PathSegment[];
  rightPath?: PathSegment[];
}
export type Change = SidePaths &
  (
    | { kind: 'added'; path: PathSegment[]; after: unknown }
    | { kind: 'removed'; path: PathSegment[]; before: unknown }
    | { kind: 'changed'; path: PathSegment[]; before: unknown; after: unknown }
    | { kind: 'moved'; path: PathSegment[]; toIndex: number }
  );
export type DiffSide = 'left' | 'right';
export type ChangeSummary = Record<ChangeKind, number>;

const differ = create({
  // Match array items by a stable id when they have one, so reorders read as moves.
  objectHash: (item: object, index?: number) => {
    const record = item as Record<string, unknown>;
    const id = record.id ?? record._id ?? record.uuid;
    return ['string', 'number', 'bigint'].includes(typeof id)
      ? `id:${String(id)}`
      : `$$index:${index ?? 0}`;
  },
  arrays: { detectMove: true, includeValueOnMove: false },
});

// jsondiffpatch ignores bigint (no delta even when the values differ), so report a differing pair as a change.
const bigintFilter: Filter<DiffContext> = function bigintDiffFilter(context) {
  if (
    typeof context.left === 'bigint' &&
    typeof context.right === 'bigint' &&
    context.left !== context.right
  ) {
    context.setResult([context.left, context.right]).exit();
  }
};
bigintFilter.filterName = 'bigint';
differ.processor.pipes.diff.before('trivial', bigintFilter);

// Treat number literals as atoms (not objects to recurse into).
const numberLiteralFilter: Filter<DiffContext> = function numberLiteralDiffFilter(context) {
  if (context.left instanceof NumberLiteral && context.right instanceof NumberLiteral) {
    context
      .setResult(
        context.left.literal === context.right.literal ? undefined : [context.left, context.right],
      )
      .exit();
  }
};
numberLiteralFilter.filterName = 'numberLiteral';
differ.processor.pipes.diff.before('trivial', numberLiteralFilter);

type DeltaNode = unknown[] | Record<string, unknown>;

const samePath = (a: readonly PathSegment[], b: readonly PathSegment[]) =>
  a.length === b.length && a.every((segment, i) => segment === b[i]);

function withSides(change: Change, left: PathSegment[], right: PathSegment[]): Change {
  if (!samePath(left, change.path)) change.leftPath = left;
  if (!samePath(right, change.path)) change.rightPath = right;
  return change;
}

/** Index maps for one array delta: items not added, removed or moved keep their relative order. */
function arrayIndexMap(delta: Record<string, unknown>) {
  const goneLeft: number[] = []; // removed or moved away, by left index
  const newRight: number[] = []; // added or moved here, by right index
  const movedHere = new Map<number, number>(); // right index → left index
  for (const key of Object.keys(delta)) {
    if (key === '_t') continue;
    const entry = delta[key];
    if (key.startsWith('_')) {
      const from = Number(key.slice(1));
      goneLeft.push(from);
      if (Array.isArray(entry) && entry[2] === 3) {
        newRight.push(entry[1] as number);
        movedHere.set(entry[1] as number, from);
      }
    } else if (Array.isArray(entry) && entry.length === 1) {
      newRight.push(Number(key));
    }
  }
  goneLeft.sort((a, b) => a - b);
  newRight.sort((a, b) => a - b);
  // The k-th kept item on one side is the k-th kept item on the other.
  const shift = (index: number, skipFrom: readonly number[], skipTo: readonly number[]) => {
    let k = index;
    for (const skipped of skipFrom) if (skipped < index) k--;
    for (const skipped of skipTo) if (skipped <= k) k++;
    return k;
  };
  return {
    leftOf: (right: number) => movedHere.get(right) ?? shift(right, newRight, goneLeft),
    rightOf: (left: number) => shift(left, goneLeft, newRight),
  };
}

// Delta format: https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
// `path` keeps the delta's own keys ("N" = right index, "_N" = left index); `left`/`right` are
// the same location translated into each document.
function collect(
  delta: DeltaNode,
  path: PathSegment[],
  left: PathSegment[],
  right: PathSegment[],
  out: Change[],
): void {
  if (Array.isArray(delta)) {
    if (delta.length === 1)
      out.push(withSides({ kind: 'added', path, after: delta[0] }, left, right));
    else if (delta.length === 2)
      out.push(
        withSides({ kind: 'changed', path, before: delta[0], after: delta[1] }, left, right),
      );
    else if (delta[2] === 0)
      out.push(withSides({ kind: 'removed', path, before: delta[0] }, left, right));
    else if (delta[2] === 3)
      out.push(
        withSides({ kind: 'moved', path, toIndex: delta[1] as number }, left, [
          ...right.slice(0, -1),
          delta[1] as number,
        ]),
      );
    return;
  }
  if (delta._t === 'a') {
    const map = arrayIndexMap(delta);
    for (const key of Object.keys(delta)) {
      if (key === '_t') continue;
      const fromLeft = key.startsWith('_');
      const index = Number(fromLeft ? key.slice(1) : key);
      const leftIndex = fromLeft ? index : map.leftOf(index);
      const rightIndex = fromLeft ? map.rightOf(index) : index;
      collect(
        delta[key] as DeltaNode,
        [...path, index],
        [...left, leftIndex],
        [...right, rightIndex],
        out,
      );
    }
    return;
  }
  for (const key of Object.keys(delta)) {
    collect(delta[key] as DeltaNode, [...path, key], [...left, key], [...right, key], out);
  }
}

export function structuralDiff(left: unknown, right: unknown): Change[] {
  const delta = differ.diff(left, right) as DeltaNode | undefined;
  const out: Change[] = [];
  if (delta !== undefined) collect(delta, [], [], [], out);
  return out;
}

export function summarizeChanges(changes: readonly Change[]): ChangeSummary {
  const summary: ChangeSummary = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const change of changes) summary[change.kind]++;
  return summary;
}

/** Where a change sits in one document (see `Change`). */
export function pathOn(change: Change, side: DiffSide): PathSegment[] {
  if (side === 'left') return change.leftPath ?? change.path;
  if (change.rightPath) return change.rightPath;
  return change.kind === 'moved' ? [...change.path.slice(0, -1), change.toIndex] : change.path;
}
