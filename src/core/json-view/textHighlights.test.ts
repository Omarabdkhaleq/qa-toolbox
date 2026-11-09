import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { lineSpanOfPointer } from './highlights';
import { applyTextHighlights } from './textHighlights';

const text = '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}';

function lineClasses(view: EditorView): string[] {
  return [...view.dom.querySelectorAll('.cm-line')].map((l) => l.className);
}

describe('applyTextHighlights', () => {
  it('decorates highlighted and focused lines and refreshes on re-apply', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: text }),
      parent: document.body,
    });
    applyTextHighlights(view, { highlights: new Map([['/a', 'removed']]), focusPointer: '/b' });
    const classes = lineClasses(view);
    expect(classes[1]).toContain('jt-hl--removed');
    expect(classes[2]).toContain('jt-focus');
    expect(classes[4]).toContain('jt-focus');
    applyTextHighlights(view, { highlights: undefined, focusPointer: null });
    expect(lineClasses(view).join(' ')).not.toContain('jt-');
    view.destroy();
  });
});

describe('lineSpanOfPointer', () => {
  it('returns the span or undefined', () => {
    expect(lineSpanOfPointer(text, '/b')).toEqual({ fromLine: 3, toLine: 5 });
    expect(lineSpanOfPointer(text, '/nope')).toBeUndefined();
  });
});
