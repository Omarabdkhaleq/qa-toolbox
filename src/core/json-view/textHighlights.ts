import { RangeSetBuilder, StateEffect, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { highlightSpans, type PathHighlights } from './highlights';

export interface TextHighlightInput {
  highlights: PathHighlights | undefined;
  /** JSON pointer of the focused change, if any. */
  focusPointer: string | null;
}

interface FieldValue {
  input: TextHighlightInput;
  decorations: DecorationSet;
}

const setInput = StateEffect.define<TextHighlightInput>();

const isEmpty = (input: TextHighlightInput) =>
  !input.highlights?.size && input.focusPointer === null;

function build(doc: Text, input: TextHighlightInput): DecorationSet {
  if (isEmpty(input)) return Decoration.none;
  const { ranges, focus } = highlightSpans(doc.toString(), input.highlights, input.focusPointer);
  const marks: { line: number; cls: string }[] = [];
  for (const r of ranges) {
    for (let l = r.fromLine; l <= Math.min(r.toLine, doc.lines); l++) {
      marks.push({ line: l, cls: `jt-hl--${r.kind}` });
    }
  }
  if (focus) {
    for (let l = focus.fromLine; l <= Math.min(focus.toLine, doc.lines); l++) {
      marks.push({ line: l, cls: 'jt-focus' });
    }
  }
  marks.sort((a, b) => a.line - b.line);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of marks) {
    const from = doc.line(m.line).from;
    builder.add(from, from, Decoration.line({ class: m.cls }));
  }
  return builder.finish();
}

const field = StateField.define<FieldValue>({
  create: () => ({
    input: { highlights: undefined, focusPointer: null },
    decorations: Decoration.none,
  }),
  update(value, tr) {
    let input = value.input;
    let changed = tr.docChanged;
    for (const e of tr.effects) {
      if (e.is(setInput)) {
        input = e.value;
        changed = true;
      }
    }
    // Rebuild against the new document, so externally replaced content never leaves stale lines.
    return changed ? { input, decorations: build(tr.state.doc, input) } : value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

/** Attach (once, and only when needed) and refresh the highlight decorations on a CodeMirror view. */
export function applyTextHighlights(view: EditorView, input: TextHighlightInput): void {
  const attached = view.state.field(field, false) !== undefined;
  if (!attached && isEmpty(input)) return;
  view.dispatch({
    effects: attached
      ? [setInput.of(input)]
      : [StateEffect.appendConfig.of(field), setInput.of(input)],
  });
}
