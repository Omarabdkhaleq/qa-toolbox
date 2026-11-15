import { describe, expect, it } from 'vitest';
import { QUERY_LANGUAGES } from './queryLanguages';

describe('QUERY_LANGUAGES', () => {
  it('offers exactly the three eval-free languages', () => {
    const ids = QUERY_LANGUAGES.map((l) => l.id.toLowerCase());
    expect(ids).toHaveLength(3);
    expect(ids.some((id) => id.includes('javascript') || id.includes('lodash'))).toBe(false);
  });
});
