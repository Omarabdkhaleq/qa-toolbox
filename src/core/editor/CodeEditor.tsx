import { json } from '@codemirror/lang-json';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { ParseError } from '../formats/types';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './code-editor.css';
import { errorsToDiagnostics } from './diagnostics';
import { editorTheme } from './theme';

export interface CodeEditorHandle {
  scrollToLine(line: number): void;
  focus(): void;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'json' | 'text';
  readOnly?: boolean;
  errors?: readonly ParseError[];
  ariaLabel: string;
  testId?: string;
  ref?: Ref<CodeEditorHandle>;
}

const NO_ERRORS: readonly ParseError[] = [];
const languageExtension = (language: 'json' | 'text') => (language === 'json' ? json() : []);
const readOnlyExtension = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
];

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  readOnly = false,
  errors = NO_ERRORS,
  ariaLabel,
  testId,
  ref,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const compartments = useRef({
    theme: new Compartment(),
    language: new Compartment(),
    readOnly: new Compartment(),
  });
  const dark = useIsDarkTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const c = compartments.current;
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lintGutter(),
          c.language.of(languageExtension(language)),
          c.readOnly.of(readOnlyExtension(readOnly)),
          c.theme.of(editorTheme(dark)),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Created once; the effects below keep it in sync with props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.theme.reconfigure(editorTheme(dark)),
    });
  }, [dark]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.language.reconfigure(languageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.readOnly.reconfigure(readOnlyExtension(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (view)
      view.dispatch(setDiagnostics(view.state, errorsToDiagnostics(view.state.doc, errors)));
  }, [errors, value]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line: number) {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc;
        const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
        view.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className="code-editor" data-testid={testId} />;
}
