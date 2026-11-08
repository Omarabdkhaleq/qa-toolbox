import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  createJSONEditor,
  isTextContent,
  Mode,
  toTextContent,
  type Content,
  type JSONEditorPropsOptional,
  type JSONParser,
} from 'vanilla-jsoneditor';
import { EditorView } from '@codemirror/view';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';
import { losslessJsonParser } from '../formats/json';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './json-view.css';
import { QUERY_LANGUAGES } from './queryLanguages';
import type { JsonValidator } from './schemaValidator';

export type JsonEditorMode = 'text' | 'tree' | 'table';

export interface JsonEditorViewHandle {
  /** The live document text, including edits the editor has not reported through onChange yet. */
  getText: () => string;
}

export interface JsonEditorViewProps {
  ref?: Ref<JsonEditorViewHandle>;
  value: string;
  onChange: (text: string) => void;
  mode?: JsonEditorMode;
  onModeChange?: (mode: JsonEditorMode) => void;
  validator?: JsonValidator;
}

const MODES: Record<JsonEditorMode, Mode> = { text: Mode.text, tree: Mode.tree, table: Mode.table };
const parser = losslessJsonParser as unknown as JSONParser;

export function contentToText(content: Content): string {
  return isTextContent(content) ? content.text : toTextContent(content, 2, parser).text;
}

/** The only place in devbox that touches vanilla-jsoneditor. The rest of the app only sees text. */
export function JsonEditorView({
  ref,
  value,
  onChange,
  mode = 'text',
  onModeChange,
  validator,
}: JsonEditorViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);
  const lastText = useRef(value);
  const callbacks = useRef({ onChange, onModeChange });
  const dark = useIsDarkTheme();

  useImperativeHandle(ref, () => ({
    getText: () => {
      // Text mode debounces its content state, so read the CodeMirror document directly when there is one.
      const cm = hostRef.current?.querySelector<HTMLElement>('.cm-editor');
      const view = cm ? EditorView.findFromDOM(cm) : null;
      if (view) return view.state.doc.toString();
      const editor = editorRef.current;
      return editor ? contentToText(editor.get()) : lastText.current;
    },
  }));

  useEffect(() => {
    callbacks.current = { onChange, onModeChange };
  });

  useEffect(() => {
    // A fresh target per mount keeps StrictMode's mount → unmount → mount clean while destroy() is async.
    const target = document.createElement('div');
    target.className = 'json-editor-view__target';
    hostRef.current!.appendChild(target);
    const props: JSONEditorPropsOptional = {
      content: { text: lastText.current },
      mode: MODES[mode],
      parser,
      validator,
      queryLanguages: QUERY_LANGUAGES,
      onChange: (content) => {
        const text = contentToText(content);
        lastText.current = text;
        callbacks.current.onChange(text);
      },
      onChangeMode: (next) => callbacks.current.onModeChange?.(next as JsonEditorMode),
    };
    const editor = createJSONEditor({ target, props });
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
      void editor.destroy().then(() => target.remove());
    };
    // Created once; the effects below sync props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value === lastText.current) return;
    lastText.current = value;
    editorRef.current?.updateProps({ content: { text: value } });
  }, [value]);

  useEffect(() => {
    editorRef.current?.updateProps({ mode: MODES[mode] });
  }, [mode]);

  useEffect(() => {
    editorRef.current?.updateProps({ validator });
  }, [validator]);

  return (
    <div
      ref={hostRef}
      className={`json-editor-view${dark ? ' jse-theme-dark' : ''}`}
      data-testid="json-editor-view"
    />
  );
}
