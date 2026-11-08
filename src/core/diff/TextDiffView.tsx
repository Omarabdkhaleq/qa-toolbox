import { json } from '@codemirror/lang-json';
import { MergeView } from '@codemirror/merge';
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, lineNumbers, type DecorationSet } from '@codemirror/view';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { editorTheme } from '../editor/theme';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './diff.css';
import { chunkIndexAt, stepFocus, type FocusStep } from './focus';
import type { DiffSide } from './structural';

/** Which change the user is looking at (`index`, or null before navigating) out of `count`. */
export interface DiffFocus {
  index: number | null;
  count: number;
}

export interface TextDiffViewHandle {
  next(): void;
  prev(): void;
  scrollToLine(side: DiffSide, line: number): void;
}

export interface TextDiffViewProps {
  left: string;
  right: string;
  language?: 'json' | 'text';
  onFocusChange?: (focus: DiffFocus) => void;
  ref?: Ref<TextDiffViewHandle>;
}

/** Lines to mark as focused in one editor; `pulse` alternates so re-focusing restarts the animation. */
interface FocusRange {
  from: number;
  end: number;
  pulse: 0 | 1;
}

const setFocus = StateEffect.define<FocusRange | null>();

function focusDecorations(state: EditorState, range: FocusRange | null): DecorationSet {
  if (!range) return Decoration.none;
  const doc = state.doc;
  const first = doc.lineAt(Math.min(range.from, doc.length)).number;
  const last = doc.lineAt(Math.min(range.end, doc.length)).number;
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = first; n <= last; n++) {
    const classes = ['cm-focusChunk', `cm-focusChunk-pulse${range.pulse}`];
    if (n === first) classes.push('cm-focusChunk-first');
    if (n === last) classes.push('cm-focusChunk-last');
    // An empty side (pure insertion/deletion) only gets a marker at the matching position.
    if (range.from === range.end) classes.push('cm-focusChunk-empty');
    const { from } = doc.line(n);
    builder.add(from, from, Decoration.line({ class: classes.join(' ') }));
  }
  return builder.finish();
}

const focusField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFocus)) return focusDecorations(tr.state, effect.value);
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/** Smoothly scrolls so the range [from, end] of `editor` sits in the middle of the visible area. */
function revealRange(editor: EditorView, from: number, end: number): void {
  const scroller = scrollParent(editor.dom);
  if (!scroller) {
    editor.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    return;
  }
  const top = editor.lineBlockAt(from).top;
  const height = editor.lineBlockAt(end).bottom - top;
  const offset = Math.max((scroller.clientHeight - height) / 2, 24);
  const target =
    scroller.scrollTop + editor.documentTop + top - scroller.getBoundingClientRect().top - offset;
  scroller.scrollTo({
    top: Math.max(0, target),
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

export function TextDiffView({
  left,
  right,
  language = 'text',
  onFocusChange,
  ref,
}: TextDiffViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MergeView | null>(null);
  const focusRef = useRef<number | null>(null);
  const pulseRef = useRef<0 | 1>(0);
  const onFocusChangeRef = useRef(onFocusChange);
  const dark = useIsDarkTheme();

  useEffect(() => {
    onFocusChangeRef.current = onFocusChange;
  });

  useEffect(() => {
    const extensions = [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      language === 'json' ? json() : [],
      editorTheme(dark),
      focusField,
    ];
    const view = new MergeView({
      a: { doc: left, extensions },
      b: { doc: right, extensions },
      parent: hostRef.current!,
      collapseUnchanged: { margin: 3, minSize: 6 },
      diffConfig: { scanLimit: 10_000, timeout: 2_000 },
    });
    viewRef.current = view;
    focusRef.current = null;
    onFocusChangeRef.current?.({ index: null, count: view.chunks.length });
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [left, right, language, dark]);

  useImperativeHandle(ref, () => {
    const focusChunk = (index: number | null) => {
      const view = viewRef.current;
      if (!view) return;
      focusRef.current = index;
      pulseRef.current = pulseRef.current === 0 ? 1 : 0;
      const pulse = pulseRef.current;
      const chunk = index === null ? undefined : view.chunks[index];
      view.a.dispatch({
        effects: setFocus.of(chunk ? { from: chunk.fromA, end: chunk.endA, pulse } : null),
      });
      view.b.dispatch({
        effects: setFocus.of(chunk ? { from: chunk.fromB, end: chunk.endB, pulse } : null),
      });
      if (chunk) {
        const useRight = chunk.fromB !== chunk.endB;
        if (useRight) revealRange(view.b, chunk.fromB, chunk.endB);
        else revealRange(view.a, chunk.fromA, chunk.endA);
      }
      onFocusChangeRef.current?.({ index, count: view.chunks.length });
    };
    const step = (direction: FocusStep) => {
      const view = viewRef.current;
      if (view) focusChunk(stepFocus(focusRef.current, view.chunks.length, direction));
    };
    return {
      next: () => step('next'),
      prev: () => step('prev'),
      scrollToLine(side, line) {
        const view = viewRef.current;
        if (!view) return;
        const editor = side === 'left' ? view.a : view.b;
        const doc = editor.state.doc;
        const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
        const index = chunkIndexAt(view.chunks, side, target.from);
        if (index !== null) {
          focusChunk(index);
          return;
        }
        editor.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
        });
      },
    };
  }, []);

  return <div ref={hostRef} className="text-diff-view" data-testid="text-diff-view" />;
}
