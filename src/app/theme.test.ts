import { describe, expect, it } from 'vitest';
import { readThemePreference, resolveTheme, writeThemePreference } from './theme';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('theme preference', () => {
  it('defaults to system and round-trips', () => {
    const s = memoryStorage();
    expect(readThemePreference(s)).toBe('system');
    writeThemePreference('dark', s);
    expect(readThemePreference(s)).toBe('dark');
  });

  it('ignores garbage and throwing storage', () => {
    const s = memoryStorage();
    s.setItem('qa-toolbox.theme', 'purple');
    expect(readThemePreference(s)).toBe('system');
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readThemePreference(throwing)).toBe('system');
    expect(() => writeThemePreference('light', throwing)).not.toThrow();
  });

  it('resolves system against the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
