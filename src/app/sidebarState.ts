import { useSyncExternalStore } from 'react';

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const KEY = 'qa-toolbox.sidebar';

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Wide-screen preference: open unless the stored value says it was closed. */
export function readSidebarOpen(storage: Storage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(KEY) !== 'closed';
  } catch {
    return true;
  }
}

export function writeSidebarOpen(
  open: boolean,
  storage: Storage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(KEY, open ? 'open' : 'closed');
  } catch {
    // UI preference only — losing it is harmless.
  }
}

export const NARROW_QUERY = '(max-width: 720px)';

/** True while the viewport is at most 720 px wide. */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia?.(NARROW_QUERY);
      media?.addEventListener('change', notify);
      return () => media?.removeEventListener('change', notify);
    },
    () => window.matchMedia?.(NARROW_QUERY).matches ?? false,
  );
}
