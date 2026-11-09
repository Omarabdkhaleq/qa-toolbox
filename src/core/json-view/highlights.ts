import jsonMap from 'json-source-map';
import { toJsonPointer, type PathSegment } from '../diff/paths';

export type HighlightKind = 'added' | 'removed' | 'changed' | 'moved' | 'ancestor';

/** Keyed by JSON pointer. */
export type PathHighlights = ReadonlyMap<string, HighlightKind>;

export interface LineRange {
  fromLine: number;
  toLine: number;
  kind: HighlightKind;
}

/** 1-based inclusive line span of the value at `pointer`: key line (value line for items/root) to value end. */
export function lineSpanOfPointer(
  text: string,
  pointer: string,
): { fromLine: number; toLine: number } | undefined {
  const entry = parsePointers(text)?.[pointer];
  if (!entry) return undefined;
  return { fromLine: (entry.key ?? entry.value).line + 1, toLine: entry.valueEnd.line + 1 };
}

function parsePointers(text: string) {
  try {
    return jsonMap.parse(text).pointers;
  } catch {
    return undefined;
  }
}

/** Line ranges to paint in text mode, sorted by line. `'ancestor'` entries are skipped. */
export function lineRangesFor(text: string, highlights: PathHighlights): LineRange[] {
  return highlightSpans(text, highlights, null).ranges;
}

/** Highlight ranges and the focus span from a single parse of `text`. */
export function highlightSpans(
  text: string,
  highlights: PathHighlights | undefined,
  focusPointer: string | null,
): { ranges: LineRange[]; focus: { fromLine: number; toLine: number } | undefined } {
  const pointers = parsePointers(text);
  const ranges: LineRange[] = [];
  let focus: { fromLine: number; toLine: number } | undefined;
  if (!pointers) return { ranges, focus };
  if (highlights) {
    for (const [pointer, kind] of highlights) {
      if (kind === 'ancestor') continue;
      const entry = pointers[pointer];
      if (!entry) continue;
      ranges.push({
        fromLine: (entry.key ?? entry.value).line + 1,
        toLine: entry.valueEnd.line + 1,
        kind,
      });
    }
  }
  ranges.sort((a, b) => a.fromLine - b.fromLine || a.toLine - b.toLine);
  const f = focusPointer === null ? undefined : pointers[focusPointer];
  if (f) focus = { fromLine: (f.key ?? f.value).line + 1, toLine: f.valueEnd.line + 1 };
  return { ranges, focus };
}

/** Class for a tree node at `path`, or undefined when it is not highlighted. */
export function classForPath(
  path: readonly PathSegment[],
  highlights: PathHighlights,
): string | undefined {
  const kind = highlights.get(toJsonPointer(path));
  return kind ? `jt-hl jt-hl--${kind}` : undefined;
}
