import type { Os, Shortcut } from './types';

interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

export function detectOs(nav: NavigatorLike | undefined = globalThis.navigator): Os {
  const hint = nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(hint) ? 'mac' : 'other';
}

const ARROWS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function keyLabel(key: string): string {
  return ARROWS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

export function formatShortcut(s: Shortcut, os: Os): string {
  const key = keyLabel(s.key);
  if (os === 'mac') {
    return `${s.mod ? '⌘' : ''}${s.ctrl ? '⌃' : ''}${s.alt ? '⌥' : ''}${s.shift ? '⇧' : ''}${key}`;
  }
  const parts: string[] = [];
  if (s.mod || s.ctrl) parts.push('Ctrl');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function matchesShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  s: Shortcut,
  os: Os,
): boolean {
  const wantMeta = !!s.mod && os === 'mac';
  const wantCtrl = !!s.ctrl || (!!s.mod && os !== 'mac');
  return (
    e.metaKey === wantMeta &&
    e.ctrlKey === wantCtrl &&
    e.altKey === !!s.alt &&
    e.shiftKey === !!s.shift &&
    e.key.toLowerCase() === s.key.toLowerCase()
  );
}
