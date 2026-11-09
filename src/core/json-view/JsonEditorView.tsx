import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
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
import { toJsonPointer, type PathSegment } from '../diff/paths';
import { losslessJsonParser } from '../formats/json';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import { classForPath, lineSpanOfPointer, type PathHighlights } from './highlights';
import './json-view.css';
import { QUERY_LANGUAGES } from './queryLanguages';
import type { JsonValidator } from './schemaValidator';
import { applyTextHighlights } from './textHighlights';

export type JsonEditorMode = 'text' | 'tree' | 'table';

export interface JsonEditorViewHandle {
  /** The live document text, including edits the editor has not reported through onChange yet. */
  getText: () => string;
  /** Scrolls the node (tree/table) or line (text) at `path` into view. */
  scrollToPath: (path: readonly PathSegment[]) => Promise<void>;
}

export interface JsonEditorViewProps {
  ref?: Ref<JsonEditorViewHandle>;
  value: string;
  onChange: (text: string) => void;
  mode?: JsonEditorMode;
  onModeChange?: (mode: JsonEditorMode) => void;
  validator?: JsonValidator;
  /** Compare highlights by JSON pointer; painted in text and tree views. */
  highlights?: PathHighlights;
  /** The change being stepped through; gets an extra focus outline. */
  focusPath?: readonly PathSegment[] | null;
  testId?: string;
  /** Shows a note above the editor while it is in table mode (table view cannot paint highlights). */
  showTableNote?: boolean;
}

const MODES: Record<JsonEditorMode, Mode> = { text: Mode.text, tree: Mode.tree, table: Mode.table };
const parser = losslessJsonParser as unknown as JSONParser;

export function contentToText(content: Content): string {
  return isTextContent(content) ? content.text : toTextContent(content, 2, parser).text;
}

/** The only place in qa-toolbox that touches vanilla-jsoneditor. The rest of the app only sees text. */
export function JsonEditorView({
  ref,
  value,
  onChange,
  mode = 'text',
  onModeChange,
  validator,
  highlights,
  focusPath = null,
  testId = 'json-editor-view',
  showTableNote = false,
}: JsonEditorViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);
  const lastText = useRef(value);
  const modeRef = useRef(mode);
  const callbacks = useRef({ onChange, onModeChange });
  const dark = useIsDarkTheme();
  const [currentMode, setCurrentMode] = useState<JsonEditorMode>(mode);
  const hl = useRef({ highlights, focusPath });
  const appliedViews = useRef(new WeakSet<EditorView>());

  const textView = useCallback((): EditorView | null => {
    if (modeRef.current !== 'text') return null;
    const cm = hostRef.current?.querySelector<HTMLElement>('.cm-editor');
    return cm ? EditorView.findFromDOM(cm) : null;
  }, []);

  const classNameFor = useCallback((path: readonly PathSegment[]) => {
    const { highlights: h, focusPath: f } = hl.current;
    const cls = h ? classForPath(path, h) : undefined;
    const focused = f && toJsonPointer(f) === toJsonPointer(path);
    return focused ? `${cls ?? ''} jt-focus`.trim() : cls;
  }, []);

  const paintText = useCallback((view: EditorView) => {
    const { highlights: h, focusPath: f } = hl.current;
    applyTextHighlights(view, { highlights: h, focusPointer: f ? toJsonPointer(f) : null });
    appliedViews.current.add(view);
  }, []);

  useImperativeHandle(ref, () => ({
    getText: () => {
      // Text mode debounces its content state, so read the CodeMirror document directly when there is one.
      // Only in text mode: in tree/table modes a '.cm-editor' may belong to a modal.
      const cm =
        modeRef.current === 'text'
          ? hostRef.current?.querySelector<HTMLElement>('.cm-editor')
          : null;
      const view = cm ? EditorView.findFromDOM(cm) : null;
      if (view) return view.state.doc.toString();
      const editor = editorRef.current;
      return editor ? contentToText(editor.get()) : lastText.current;
    },
    scrollToPath: async (path) => {
      const view = textView();
      if (view) {
        const span = lineSpanOfPointer(view.state.doc.toString(), toJsonPointer(path));
        if (span) {
          const pos = view.state.doc.line(Math.min(span.fromLine, view.state.doc.lines)).from;
          view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
        }
        return;
      }
      await editorRef.current?.scrollTo(path.map(String));
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
      onClassName: classNameFor,
      onChangeMode: (next) => {
        modeRef.current = next as JsonEditorMode;
        setCurrentMode(next as JsonEditorMode);
        callbacks.current.onModeChange?.(next as JsonEditorMode);
      },
    };
    const editor = createJSONEditor({ target, props });
    editorRef.current = editor;
    // A mode switch back to text builds a new CodeMirror view; re-attach the decorations to it.
    const observer = new MutationObserver(() => {
      const view = textView();
      if (view && !appliedViews.current.has(view)) paintText(view);
    });
    observer.observe(target, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      editorRef.current = null;
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
    modeRef.current = mode;
    setCurrentMode(mode);
    editorRef.current?.updateProps({ mode: MODES[mode] });
  }, [mode]);

  // Repaint on highlight/focus/text changes: tree via a fresh onClassName identity, text via decorations.
  useEffect(() => {
    hl.current = { highlights, focusPath };
    // A new function identity makes the tree re-evaluate every node's class.
    editorRef.current?.updateProps({ onClassName: (path) => classNameFor(path) });
    const view = textView();
    if (view) paintText(view);
  }, [highlights, focusPath, value, textView, paintText, classNameFor]);

  useEffect(() => {
    editorRef.current?.updateProps({ validator });
  }, [validator]);

  return (
    <div className="json-editor-view-wrap">
      {showTableNote && currentMode === 'table' ? (
        <p className="json-editor-view__note" role="note">
          Differences are highlighted in text and tree views
        </p>
      ) : null}
      <div
        ref={hostRef}
        className={`json-editor-view${dark ? ' jse-theme-dark' : ''}`}
        data-testid={testId}
      />
    </div>
  );
}
