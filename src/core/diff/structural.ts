import { create, type DiffContext, type Filter } from 'jsondiffpatch';
import { NumberLiteral } from './numberLiteral';
import type { PathSegment } from './paths';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';
export type Change =
  | { kind: 'added'; path: PathSegment[]; after: unknown }
  | { kind: 'removed'; path: PathSegment[]; before: unknown }
  | { kind: 'changed'; path: PathSegment[]; before: unknown; after: unknown }
  | { kind: 'moved'; path: PathSegment[]; toIndex: number };
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

// Delta format: https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
function collect(delta: DeltaNode, path: PathSegment[], out: Change[]): void {
  if (Array.isArray(delta)) {
    if (delta.length === 1) out.push({ kind: 'added', path, after: delta[0] });
    else if (delta.length === 2)
      out.push({ kind: 'changed', path, before: delta[0], after: delta[1] });
    else if (delta[2] === 0) out.push({ kind: 'removed', path, before: delta[0] });
    else if (delta[2] === 3) out.push({ kind: 'moved', path, toIndex: delta[1] as number });
    return;
  }
  const isArrayDelta = delta._t === 'a';
  for (const key of Object.keys(delta)) {
    if (isArrayDelta && key === '_t') continue;
    // Array keys: "N" = index in the right array, "_N" = index in the left array.
    const segment: PathSegment = isArrayDelta
      ? Number(key.startsWith('_') ? key.slice(1) : key)
      : key;
    collect(delta[key] as DeltaNode, [...path, segment], out);
  }
}

export function structuralDiff(left: unknown, right: unknown): Change[] {
  const delta = differ.diff(left, right) as DeltaNode | undefined;
  const out: Change[] = [];
  if (delta !== undefined) collect(delta, [], out);
  return out;
}

export function summarizeChanges(changes: readonly Change[]): ChangeSummary {
  const summary: ChangeSummary = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const change of changes) summary[change.kind]++;
  return summary;
}
