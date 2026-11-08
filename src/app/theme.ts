import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const KEY = 'qa-toolbox.theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(
  storage: Storage | undefined = defaultStorage(),
): ThemePreference {
  try {
    const value = storage?.getItem(KEY);
    return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  pref: ThemePreference,
  storage: Storage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(KEY, pref);
  } catch {
    // UI preference only — losing it is harmless.
  }
}

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return prefersDark ? 'dark' : 'light';
  return pref;
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(() => readThemePreference());

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(pref, media?.matches ?? false);
    };
    apply();
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [pref]);

  const update = (next: ThemePreference) => {
    writeThemePreference(next);
    setPref(next);
  };
  return [pref, update];
}
