import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { lineRangesFor, lineSpanOfPointer, type PathHighlights } from './highlights';

export interface TextHighlightInput {
  highlights: PathHighlights | undefined;
  /** JSON pointer of the focused change, if any. */
  focusPointer: string | null;
}

const replace = StateEffect.define<DecorationSet>();

function build(view: EditorView, input: TextHighlightInput): DecorationSet {
  const { doc } = view.state;
  const text = doc.toString();
  const marks: { line: number; cls: string }[] = [];
  if (input.highlights?.size) {
    for (const r of lineRangesFor(text, input.highlights)) {
      for (let l = r.fromLine; l <= Math.min(r.toLine, doc.lines); l++) {
        marks.push({ line: l, cls: `jt-hl--${r.kind}` });
      }
    }
  }
  if (input.focusPointer !== null) {
    const span = lineSpanOfPointer(text, input.focusPointer);
    if (span) {
      for (let l = span.fromLine; l <= Math.min(span.toLine, doc.lines); l++) {
        marks.push({ line: l, cls: 'jt-focus' });
      }
    }
  }
  marks.sort((a, b) => a.line - b.line);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of marks) {
    builder.add(doc.line(m.line).from, doc.line(m.line).from, Decoration.line({ class: m.cls }));
  }
  return builder.finish();
}

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(replace)) return e.value;
    // Between pushes, keep decorations attached to their lines while the user types.
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Attach (once) and refresh the highlight decorations on a CodeMirror view. */
export function applyTextHighlights(view: EditorView, input: TextHighlightInput): void {
  if (view.state.field(field, false) === undefined) {
    view.dispatch({ effects: StateEffect.appendConfig.of(field) });
  }
  const decorations = build(view, input);
  view.dispatch({ effects: replace.of(decorations) });
}
