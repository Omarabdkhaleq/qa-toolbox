import { useMemo, useRef, type Ref } from 'react';
import { downloadText } from '../../core/io/download';
import { readFileAsText } from '../../core/io/file';
import { useFileDrop } from '../../core/io/useFileDrop';
import {
  JsonEditorView,
  type JsonEditorMode,
  type JsonEditorViewHandle,
} from '../../core/json-view/JsonEditorView';
import { createSchemaValidator } from '../../core/json-view/schemaValidator';
import { useAsyncValue } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import { Banner } from '../../core/ui/Banner';
import { runInWorker, WORKER_THRESHOLD_CHARS } from '../../core/worker/runInWorker';
import {
  computeStatus,
  parseIndentChoice,
  statusLabel,
  type EditAction,
  type EditorStatus,
  type IndentChoice,
} from './logic';
import { SchemaPanel } from './SchemaPanel';

export type Side = 'left' | 'right';
export type Notice = { kind: 'error' | 'info'; text: string } | null;

const createStatusWorker = () =>
  new Worker(new URL('./status.worker.ts', import.meta.url), { type: 'module' });

async function computeStatusAsync(text: string, signal: AbortSignal): Promise<EditorStatus> {
  return text.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<string, EditorStatus>(createStatusWorker, text, { signal })
    : computeStatus(text);
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const LABEL: Record<Side, string> = { left: 'Left', right: 'Right' };

export interface EditorPaneProps {
  side: Side;
  /** Collapsed by the split; stays mounted so the editor keeps its state. */
  hidden?: boolean;
  ref?: Ref<JsonEditorViewHandle>;
  text: string;
  onTextChange: (text: string) => void;
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
}

export function EditorPane(props: EditorPaneProps) {
  const { side, ref, text, indent, schemaOpen, schemaText, notice, onNotice, onRun } = props;
  const fileInput = useRef<HTMLInputElement>(null);

  const status = useAsyncValue(useDebouncedValue(text, 150), computeStatusAsync);
  const debouncedSchema = useDebouncedValue(schemaText, 300);
  const schema = useMemo(() => createSchemaValidator(debouncedSchema), [debouncedSchema]);
  const validator = schemaOpen && schema?.ok ? schema.validator : undefined;

  const openFile = async (file: File) => {
    try {
      props.onTextChange(await readFileAsText(file));
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
