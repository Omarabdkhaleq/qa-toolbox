export type HighlightKind = 'added' | 'removed' | 'changed' | 'moved' | 'ancestor';

/** Keyed by JSON pointer. */
export type PathHighlights = ReadonlyMap<string, HighlightKind>;
