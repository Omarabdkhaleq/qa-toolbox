import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as highlights from './highlights';
import { applyTextHighlights } from './textHighlights';

vi.mock('./highlights', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./highlights')>();
  return { ...actual, highlightSpans: vi.fn(actual.highlightSpans) };
});

const text = '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}';
const lineClasses = (view: EditorView) =>
  [...view.dom.querySelectorAll('.cm-line')].map((l) => l.className);
const spans = vi.mocked(highlights.highlightSpans);

describe('applyTextHighlights while typing', () => {
  afterEach(() => spans.mockClear());

  it('maps decorations through a small edit without re-parsing the document', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: text }),
      parent: document.body,
    });
    applyTextHighlights(view, { highlights: new Map([['/b', 'changed']]), focusPointer: null });
    expect(spans).toHaveBeenCalledTimes(1);

    // Insert a new line above "b": its highlight moves down with it.
    const at = view.state.doc.line(2).to;
    view.dispatch({ changes: { from: at, insert: '\n  "x": 0,' } });
    expect(spans).toHaveBeenCalledTimes(1);
    const classes = lineClasses(view);
    expect(classes[2]).not.toContain('jt-hl');
    expect(classes[3]).toContain('jt-hl--changed');
    expect(classes[5]).toContain('jt-hl--changed');
    view.destroy();
  });

  it('re-parses when new highlights arrive or the whole document is replaced', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: text }),
      parent: document.body,
    });
    applyTextHighlights(view, { highlights: new Map([['/a', 'changed']]), focusPointer: null });
    applyTextHighlights(view, { highlights: new Map([['/b', 'changed']]), focusPointer: null });
    expect(spans).toHaveBeenCalledTimes(2);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '{\n  "b": 1\n}' } });
    expect(spans).toHaveBeenCalledTimes(3);
    expect(lineClasses(view)[1]).toContain('jt-hl--changed');
    view.destroy();
  });
});
