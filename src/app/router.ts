import { useSyncExternalStore } from 'react';

export type Route =
  { kind: 'home' } | { kind: 'tool'; toolId: string } | { kind: 'unknown'; path: string };

const TOOL_ROUTE = /^\/tools\/([a-z0-9-]+)\/?$/;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { kind: 'home' };
  const match = TOOL_ROUTE.exec(path);
  return match?.[1] ? { kind: 'tool', toolId: match[1] } : { kind: 'unknown', path };
}

export function toolHref(id: string): string {
  return `#/tools/${id}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useHashLocation(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
