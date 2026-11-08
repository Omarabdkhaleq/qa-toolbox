import { describe, expect, it } from 'vitest';
import { toJsonPath, toJsonPointer } from './paths';

describe('paths', () => {
  it('builds JSONPath with dot and bracket notation', () => {
    expect(toJsonPath([])).toBe('$');
    expect(toJsonPath(['users', 2, 'email'])).toBe('$.users[2].email');
    expect(toJsonPath(['my key', '$ok', '1abc'])).toBe('$["my key"].$ok["1abc"]');
  });

  it('builds escaped JSON pointers', () => {
    expect(toJsonPointer([])).toBe('');
    expect(toJsonPointer(['a/b', 'c~d', 0])).toBe('/a~1b/c~0d/0');
  });
});
