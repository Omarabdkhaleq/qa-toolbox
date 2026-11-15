import { describe, expect, it } from 'vitest';
import { readSidebarOpen, writeSidebarOpen } from './sidebarState';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('sidebar preference', () => {
  it('defaults to open and round-trips', () => {
    const s = memoryStorage();
    expect(readSidebarOpen(s)).toBe(true);
    writeSidebarOpen(false, s);
    expect(readSidebarOpen(s)).toBe(false);
    writeSidebarOpen(true, s);
    expect(readSidebarOpen(s)).toBe(true);
  });

  it('uses the qa-toolbox.sidebar key and ignores garbage', () => {
    const s = memoryStorage();
    writeSidebarOpen(false, s);
    expect(s.getItem('qa-toolbox.sidebar')).toBe('closed');
    s.setItem('qa-toolbox.sidebar', 'banana');
    expect(readSidebarOpen(s)).toBe(true);
  });

  it('survives missing and throwing storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSidebarOpen(throwing)).toBe(true);
    expect(() => writeSidebarOpen(false, throwing)).not.toThrow();
    expect(() => writeSidebarOpen(false, undefined)).not.toThrow();
  });
});
