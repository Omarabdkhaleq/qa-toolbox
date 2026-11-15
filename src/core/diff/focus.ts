import type { DiffSide } from './structural';

/** The part of a merge-view chunk the focus logic needs (positions in each document). */
export interface ChunkRange {
  fromA: number;
  endA: number;
  fromB: number;
  endB: number;
}

export type FocusStep = 'next' | 'prev';

/** Next focused chunk index; stays at the ends rather than wrapping. `null` = nothing focused. */
export function stepFocus(current: number | null, count: number, step: FocusStep): number | null {
  if (count === 0) return null;
  if (current === null) return step === 'next' ? 0 : count - 1;
  return step === 'next' ? Math.min(current + 1, count - 1) : Math.max(current - 1, 0);
}

export function focusLabel(current: number | null, count: number): string {
  if (count === 0) return 'No changes';
  if (current === null) return `${count} change${count === 1 ? '' : 's'}`;
  return `Change ${current + 1} of ${count}`;
}

/** Index of the chunk that contains `pos` in the given side's document, or null. */
export function chunkIndexAt(
  chunks: readonly ChunkRange[],
  side: DiffSide,
  pos: number,
): number | null {
  const index = chunks.findIndex((chunk) => {
    const [from, end] = side === 'left' ? [chunk.fromA, chunk.endA] : [chunk.fromB, chunk.endB];
    return pos >= from && pos <= end;
  });
  return index === -1 ? null : index;
}
