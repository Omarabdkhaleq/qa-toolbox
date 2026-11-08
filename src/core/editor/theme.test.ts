import { describe, expect, it } from 'vitest';
import { editorTheme } from './theme';

describe('editorTheme', () => {
  it('adds the dark theme only in dark mode', () => {
    const light = editorTheme(false) as unknown[];
    const dark = editorTheme(true) as unknown[];
    expect(dark.length).toBe(light.length + 1);
  });
});
