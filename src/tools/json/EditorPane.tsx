import { useMemo, useRef, type Ref } from 'react';
import { downloadText } from '../../core/io/download';
import { readFileAsText } from '../../core/io/file';
import { useFileDrop } from '../../core/io/useFileDrop';
import {
  JsonEditorView,
  type JsonEditorMode,
  type JsonEditorViewHandle,
} from '../../core/json-view/JsonEditorView';
import type { PathHighlights } from '../../core/json-view/highlights';
import { createSchemaValidator } from '../../core/json-view/schemaValidator';
import type { AsyncState } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import type { PathSegment } from '../../core/diff/paths';
import { Banner } from '../../core/ui/Banner';
import {
  parseIndentChoice,
  statusLabel,
  type EditAction,
  type EditorStatus,
  type IndentChoice,
} from './logic';
import { SchemaPanel } from './SchemaPanel';

export type Side = 'left' | 'right';
export type Notice = { kind: 'error' | 'info'; text: string } | null;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const LABEL: Record<Side, string> = { left: 'Left', right: 'Right' };

export interface EditorPaneProps {
  side: Side;
  /** Collapsed by the split; stays mounted so the editor keeps its state. */
  hidden?: boolean;
  ref?: Ref<JsonEditorViewHandle>;
  text: string;
  /** Edits made in the editor (typing, tree/table edits). */
  onTextChange: (text: string) => void;
  /** The whole document was replaced (Open file, drop). */
  onReplaceText: (text: string) => void;
  /** The document's status (computed by the parent from `text`). */
  status: AsyncState<EditorStatus>;
  indent: IndentChoice;
  onIndentChange: (indent: IndentChoice) => void;
  mode: JsonEditorMode;
  onModeChange: (mode: JsonEditorMode) => void;
  schemaOpen: boolean;
  onSchemaOpenChange: (open: boolean) => void;
  schemaText: string;
  onSchemaTextChange: (text: string) => void;
  notice: Notice;
  onNotice: (notice: Notice) => void;
  onRun: (action: EditAction['kind']) => void;
  onCopy: () => void;
  /** The live editor text (edits not yet reported through onTextChange included). */
  getText: () => string;
  highlights?: PathHighlights;
  focusPath?: readonly PathSegment[] | null;
  showTableNote?: boolean;
  onEditorFocus?: () => void;
  onEditorBlur?: () => void;
  onEditorPaste?: (text: string) => void;
}

export function EditorPane(props: EditorPaneProps) {
  const { side, ref, text, indent, schemaOpen, schemaText, notice, onNotice, onRun, status } =
    props;
  const fileInput = useRef<HTMLInputElement>(null);
  const debouncedSchema = useDebouncedValue(schemaText, 300);
  const schema = useMemo(() => createSchemaValidator(debouncedSchema), [debouncedSchema]);
  const validator = schemaOpen && schema?.ok ? schema.validator : undefined;

  const openFile = async (file: File) => {
    try {
      props.onReplaceText(await readFileAsText(file));
      onNotice(null);
    } catch (err) {
      onNotice({ kind: 'error', text: messageOf(err) });
    }
  };
  const { isOver, dropProps } = useFileDrop((file) => void openFile(file));

  const statusClass =
    status.status === 'done' && status.value.state !== 'empty'
      ? ` status-bar--${status.value.state}`
      : '';

  return (
    <section
      className="json-pane"
      data-testid={`json-${side}`}
      aria-label={`${LABEL[side]} JSON`}
      hidden={props.hidden}
    >
      <div className="toolbar" role="toolbar" aria-label={`${LABEL[side]} JSON actions`}>
        <button type="button" onClick={() => onRun('format')}>
          Format
        </button>
        <select
          aria-label="Indentation"
          value={indent === '\t' ? 'tab' : String(indent)}
          onChange={(e) => props.onIndentChange(parseIndentChoice(e.target.value))}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <button type="button" onClick={() => onRun('minify')}>
          Minify
        </button>
        <button type="button" onClick={() => onRun('sortKeys')}>
          Sort keys
        </button>
        <button type="button" onClick={() => onRun('repair')}>
          Repair
        </button>
        <span className="toolbar__spacer" />
        <button type="button" onClick={() => fileInput.current?.click()}>
          Open file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          data-testid={`file-input-${side}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={props.onCopy} disabled={text === ''}>
          Copy
        </button>
        <button
          type="button"
          onClick={() => downloadText('document.json', props.getText())}
          disabled={text === ''}
        >
          Download
        </button>
        <button
          type="button"
          aria-pressed={schemaOpen}
          onClick={() => props.onSchemaOpenChange(!schemaOpen)}
        >
          Schema
        </button>
      </div>

      {notice && (
        <Banner kind={notice.kind} onDismiss={() => onNotice(null)}>
          {notice.text}
        </Banner>
      )}

      <div className={`json-pane__workspace${isOver ? ' is-drop-target' : ''}`} {...dropProps}>
        <JsonEditorView
          ref={ref}
          testId={`json-editor-${side}`}
          value={text}
          onChange={props.onTextChange}
          mode={props.mode}
          onModeChange={props.onModeChange}
          validator={validator}
          highlights={props.highlights}
          focusPath={props.focusPath}
          showTableNote={props.showTableNote}
          onFocus={props.onEditorFocus}
          onBlur={props.onEditorBlur}
          onPaste={props.onEditorPaste}
        />
        {schemaOpen && (
          <SchemaPanel
            value={schemaText}
            onChange={props.onSchemaTextChange}
            result={schema}
            testId={`schema-editor-${side}`}
          />
        )}
      </div>

      <div
        className={`status-bar${statusClass}`}
        data-testid={`status-${side}`}
        role="status"
        aria-label={`${LABEL[side]} status`}
      >
        {status.status === 'done' && statusLabel(status.value)}
        {status.status === 'pending' && 'Checking…'}
        {status.status === 'error' && `Could not check the document: ${status.error.message}`}
      </div>
    </section>
  );
}
