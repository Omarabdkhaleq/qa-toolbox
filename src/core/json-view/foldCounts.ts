import { StateEffect, StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeFolding } from '@codemirror/language';

/** Number of top-level items in the text between an array's brackets. */
export function countArrayItems(body: string): number {
  let depth = 0;
  let inString = false;
  let commas = 0;
  let hasContent = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
    hasContent = true;
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) commas++;
  }
  return hasContent ? commas + 1 : 0;
}

export function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

// A folded array shows "… N items"; anything else keeps the plain "…" marker.
const foldCounts = codeFolding({
  preparePlaceholder: (state, range) =>
    state.sliceDoc(range.from - 1, range.from) === '['
      ? countArrayItems(state.sliceDoc(range.from, range.to))
      : null,
  placeholderDOM: (_view, onclick, prepared: number | null) => {
    const el = document.createElement('span');
    el.className = 'cm-foldPlaceholder';
    el.title = 'unfold';
    el.onclick = onclick;
    if (prepared === null) {
      el.textContent = '…';
      el.setAttribute('aria-label', 'folded code');
    } else {
      el.textContent = `… ${itemsLabel(prepared)}`;
      el.setAttribute('aria-label', `Folded array, ${itemsLabel(prepared)}`);
    }
    return el;
  },
});

// Marks a state that already has the extension. The editor library can replace a view's whole
// state (e.g. when content is set from outside), which drops appended config, so the check is
// per state, not per view.
const marker = StateField.define<true>({ create: () => true, update: (v) => v });

/** Adds the item-count fold marker to a CodeMirror view's current state if it is missing. */
export function applyFoldCounts(view: EditorView): void {
  if (view.state.field(marker, false)) return;
  view.dispatch({ effects: StateEffect.appendConfig.of([marker, foldCounts]) });
}
