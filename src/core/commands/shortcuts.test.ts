import { describe, expect, it } from 'vitest';
import { detectOs, formatShortcut, matchesShortcut } from './shortcuts';

describe('detectOs', () => {
  it('detects mac from platform', () => {
    expect(detectOs({ platform: 'MacIntel', userAgent: '' })).toBe('mac');
  });
  it('treats other platforms as other', () => {
    expect(detectOs({ platform: 'Win32', userAgent: '' })).toBe('other');
  });
  it('prefers userAgentData.platform', () => {
    expect(detectOs({ platform: '', userAgent: '', userAgentData: { platform: 'macOS' } })).toBe(
      'mac',
    );
  });
  it('falls back to the user agent', () => {
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' })).toBe('mac');
    expect(detectOs({})).toBe('other');
  });
});

describe('formatShortcut', () => {
  it('formats mod+K per OS', () => {
    expect(formatShortcut({ mod: true, key: 'k' }, 'mac')).toBe('⌘K');
    expect(formatShortcut({ mod: true, key: 'k' }, 'other')).toBe('Ctrl+K');
  });
  it('formats ctrl+alt+arrow per OS', () => {
    const s = { ctrl: true, alt: true, key: 'ArrowDown' };
    expect(formatShortcut(s, 'mac')).toBe('⌃⌥↓');
    expect(formatShortcut(s, 'other')).toBe('Ctrl+Alt+↓');
  });
  it('formats shift and ArrowUp', () => {
    expect(formatShortcut({ shift: true, key: 'ArrowUp' }, 'mac')).toBe('⇧↑');
    expect(formatShortcut({ shift: true, key: 'ArrowUp' }, 'other')).toBe('Shift+↑');
  });
});

describe('matchesShortcut', () => {
  const ev = (o: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    key: 'k',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...o,
  });
  it('maps mod to meta on mac and ctrl elsewhere', () => {
    expect(matchesShortcut(ev({ metaKey: true }), { mod: true, key: 'k' }, 'mac')).toBe(true);
    expect(matchesShortcut(ev({ metaKey: true }), { mod: true, key: 'k' }, 'other')).toBe(false);
    expect(matchesShortcut(ev({ ctrlKey: true }), { mod: true, key: 'k' }, 'other')).toBe(true);
    expect(matchesShortcut(ev({ ctrlKey: true }), { mod: true, key: 'k' }, 'mac')).toBe(false);
  });
  it('requires exact modifiers and is case-insensitive on the key', () => {
    expect(
      matchesShortcut(
        { ...ev({ ctrlKey: true, shiftKey: true }), key: 'K' },
        { mod: true, key: 'k' },
        'other',
      ),
    ).toBe(false);
    expect(
      matchesShortcut({ ...ev({ ctrlKey: true }), key: 'K' }, { mod: true, key: 'k' }, 'other'),
    ).toBe(true);
    expect(
      matchesShortcut(
        { ...ev({ ctrlKey: true, altKey: true }), key: 'ArrowDown' },
        { ctrl: true, alt: true, key: 'ArrowDown' },
        'mac',
      ),
    ).toBe(true);
  });
});
