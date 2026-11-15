import { describe, expect, it } from 'vitest';
import { chunkIndexAt, focusLabel, stepFocus } from './focus';

describe('stepFocus', () => {
  it('starts at the first change on next and the last on prev', () => {
    expect(stepFocus(null, 3, 'next')).toBe(0);
    expect(stepFocus(null, 3, 'prev')).toBe(2);
  });

  it('moves one change at a time', () => {
    expect(stepFocus(0, 3, 'next')).toBe(1);
    expect(stepFocus(2, 3, 'prev')).toBe(1);
  });

  it('stays at the ends instead of wrapping', () => {
    expect(stepFocus(2, 3, 'next')).toBe(2);
    expect(stepFocus(0, 3, 'prev')).toBe(0);
  });

  it('has nothing to focus when there are no changes', () => {
    expect(stepFocus(null, 0, 'next')).toBeNull();
    expect(stepFocus(0, 0, 'prev')).toBeNull();
  });
});

describe('focusLabel', () => {
  it('counts changes before navigation and shows position during it', () => {
    expect(focusLabel(null, 0)).toBe('No changes');
    expect(focusLabel(null, 1)).toBe('1 change');
    expect(focusLabel(null, 5)).toBe('5 changes');
    expect(focusLabel(1, 5)).toBe('Change 2 of 5');
  });
});

describe('chunkIndexAt', () => {
  // Chunk 0 covers 10..20 in A and 10..25 in B; chunk 1 is empty in A at 40 (pure insertion in B 45..60).
  const chunks = [
    { fromA: 10, endA: 20, fromB: 10, endB: 25 },
    { fromA: 40, endA: 40, fromB: 45, endB: 60 },
  ];

  it('finds the chunk containing a position on either side', () => {
    expect(chunkIndexAt(chunks, 'left', 15)).toBe(0);
    expect(chunkIndexAt(chunks, 'right', 25)).toBe(0);
    expect(chunkIndexAt(chunks, 'right', 50)).toBe(1);
  });

  it('matches an empty chunk only at its exact position', () => {
    expect(chunkIndexAt(chunks, 'left', 40)).toBe(1);
    expect(chunkIndexAt(chunks, 'left', 41)).toBeNull();
  });

  it('returns null outside every chunk', () => {
    expect(chunkIndexAt(chunks, 'left', 5)).toBeNull();
    expect(chunkIndexAt([], 'right', 0)).toBeNull();
  });
});
