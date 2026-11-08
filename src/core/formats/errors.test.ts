import { describe, expect, it } from 'vitest';
import { describeParseError } from './errors';

describe('describeParseError', () => {
  it('adds the position when known', () => {
    expect(describeParseError({ message: 'Bad', line: 3, column: 7 })).toBe(
      'Bad (line 3, column 7)',
    );
    expect(describeParseError({ message: 'Bad' })).toBe('Bad');
  });
});
