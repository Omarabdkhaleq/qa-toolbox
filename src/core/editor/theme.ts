import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

const base = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--bg-editor)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
});

export function editorTheme(dark: boolean): Extension {
  const shared = [base, syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
  return dark ? [...shared, oneDark] : shared;
}
