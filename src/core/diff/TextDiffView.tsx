import { json } from '@codemirror/lang-json';
import { goToNextChunk, goToPreviousChunk, MergeView } from '@codemirror/merge';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { editorTheme } from '../editor/theme';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './diff.css';
import type { DiffSide } from './structural';

export interface TextDiffViewHandle {
  next(): void;
  prev(): void;
  scrollToLine(side: DiffSide, line: number): void;
}

export interface TextDiffViewProps {
  left: string;
  right: string;
  language?: 'json' | 'text';
  ref?: Ref<TextDiffViewHandle>;
}

export function TextDiffView({ left, right, language = 'text', ref }: TextDiffViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MergeView | null>(null);
  const dark = useIsDarkTheme();

  useEffect(() => {
    const extensions = [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      language === 'json' ? json() : [],
      editorTheme(dark),
    ];
    const view = new MergeView({
      a: { doc: left, extensions },
      b: { doc: right, extensions },
      parent: hostRef.current!,
      collapseUnchanged: { margin: 3, minSize: 6 },
      diffConfig: { scanLimit: 10_000, timeout: 2_000 },
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [left, right, language, dark]);

  useImperativeHandle(ref, () => {
    const command = (run: typeof goToNextChunk) => {
      const view = viewRef.current;
      if (view) run({ state: view.b.state, dispatch: (tr: Transaction) => view.b.dispatch(tr) });
    };
    return {
      next: () => command(goToNextChunk),
      prev: () => command(goToPreviousChunk),
      scrollToLine(side, line) {
        const view = viewRef.current;
        if (!view) return;
        const editor = side === 'left' ? view.a : view.b;
        const doc = editor.state.doc;
        const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
        editor.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
        });
      },
    };
  }, []);

  return <div ref={hostRef} className="text-diff-view" data-testid="text-diff-view" />;
}
