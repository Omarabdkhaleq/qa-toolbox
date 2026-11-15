// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = read('./styles.css');
const jsonViewCss = read('../core/json-view/json-view.css');

/** Custom properties declared directly in the first `selector { … }` block. */
function declarations(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[match[1]!] = match[2]!.trim();
  return out;
}

const light = declarations(styles, ':root');
const themes = {
  light,
  // Dark overrides some tokens and inherits the rest.
  dark: { ...light, ...declarations(styles, ":root[data-theme='dark']") },
};

type Rgba = [number, number, number, number];
function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1]!.split(',').map(Number);
    return [r!, g!, b!, a];
  }
  throw new Error(`unsupported colour ${value}`);
}
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [
  r * a + br * (1 - a),
  g * a + bg * (1 - a),
  b * a + bb * (1 - a),
  1,
];
function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const VALUE_TOKENS = [
  '--json-key',
  '--json-string',
  '--json-number',
  '--json-boolean',
  '--json-null',
];
const TINTS = ['--hl-removed', '--hl-added', '--hl-changed', '--hl-moved', '--hl-ancestor'];

describe('JSON value colours (WCAG AA)', () => {
  for (const [name, tokens] of Object.entries(themes)) {
    const color = (token: string) => {
      const value = tokens[token as keyof typeof tokens];
      if (!value) throw new Error(`${name}: missing ${token}`);
      return parseColor(value);
    };

    it(`${name}: every value colour is at least 4.5:1 on the editor and on every highlight tint`, () => {
      const editor = color('--bg-editor');
      const failures: string[] = [];
      for (const value of VALUE_TOKENS) {
        for (const [bgName, bg] of [
          ['--bg-editor', editor] as const,
          ...TINTS.map((tint) => [tint, over(color(tint), editor)] as const),
        ]) {
          const ratio = contrast(color(value), bg);
          if (ratio < 4.5) failures.push(`${value} on ${bgName}: ${ratio.toFixed(2)}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it(`${name}: palette rows keep 4.5:1, selected or dimmed`, () => {
      expect(contrast(color('--accent-fg'), color('--accent'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color('--fg-muted'), color('--bg'))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the editors use these tokens for their value colours and background in both themes', () => {
    const lightEditor = declarations(jsonViewCss, '.json-editor-view:not(.jse-theme-dark)');
    const darkEditor = declarations(jsonViewCss, '.json-editor-view.jse-theme-dark');
    const expected = {
      '--jse-background-color': 'var(--bg-editor)',
      '--jse-key-color': 'var(--json-key)',
      '--jse-value-color-string': 'var(--json-string)',
      '--jse-value-color-url': 'var(--json-string)',
      '--jse-value-color-number': 'var(--json-number)',
      '--jse-value-color-boolean': 'var(--json-boolean)',
      '--jse-value-color-null': 'var(--json-null)',
    };
    expect(lightEditor).toMatchObject(expected);
    expect(darkEditor).toMatchObject(expected);
  });
});
