import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.dataset.theme === 'dark';

export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark);
}
