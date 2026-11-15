import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { foldEffect } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { applyFoldCounts, countArrayItems, itemsLabel } from './foldCounts';

describe('countArrayItems', () => {
  it('counts top-level items', () => {
    expect(countArrayItems('1, 2, 3')).toBe(3);
    expect(countArrayItems('\n  "a",\n  "b"\n')).toBe(2);
  });

  it('returns 0 for an empty array body', () => {
    expect(countArrayItems('')).toBe(0);
    expect(countArrayItems('  \n ')).toBe(0);
  });

  it('ignores commas inside nested values and strings', () => {
    expect(countArrayItems('[1, 2], {"a": 1, "b": [3, 4]}, "x, y", "q\\", r"')).toBe(4);
  });
});

describe('itemsLabel', () => {
  it('uses the singular for one item', () => {
    expect(itemsLabel(1)).toBe('1 item');
    expect(itemsLabel(0)).toBe('0 items');
    expect(itemsLabel(12)).toBe('12 items');
  });
});

function viewOf(doc: string) {
  const view = new EditorView({ state: EditorState.create({ doc, extensions: [json()] }) });
  applyFoldCounts(view);
  return view;
}

function foldInside(view: EditorView, open: string) {
  const doc = view.state.doc.toString();
  const from = doc.indexOf(open) + 1;
  const close = open === '[' ? ']' : '}';
  view.dispatch({ effects: foldEffect.of({ from, to: doc.lastIndexOf(close) }) });
}

describe('applyFoldCounts', () => {
  it('shows the item count on a folded array', () => {
    const view = viewOf('{\n  "list": [\n    1,\n    {"a": [2, 3]},\n    "x"\n  ]\n}');
    foldInside(view, '[');
    const placeholder = view.dom.querySelector('.cm-foldPlaceholder');
    expect(placeholder?.textContent).toBe('… 3 items');
    expect(placeholder?.getAttribute('aria-label')).toBe('Folded array, 3 items');
    view.destroy();
  });

  it('keeps the plain marker on a folded object', () => {
    const view = viewOf('{\n  "a": 1,\n  "b": 2\n}');
    foldInside(view, '{');
    expect(view.dom.querySelector('.cm-foldPlaceholder')?.textContent).toBe('…');
    view.destroy();
  });

  it('attaches only once per view', () => {
    const view = viewOf('[1]');
    const before = view.state;
    applyFoldCounts(view);
    expect(view.state).toBe(before);
    view.destroy();
  });
});
