import { useEffect, useMemo, useRef, useState } from 'react';
import { describeParseError } from '../../core/formats/errors';
import { copyToClipboard } from '../../core/io/clipboard';
import { downloadText } from '../../core/io/download';
import { readFileAsText } from '../../core/io/file';
import { useFileDrop } from '../../core/io/useFileDrop';
import { JsonEditorView } from '../../core/json-view/JsonEditorView';
import { createSchemaValidator } from '../../core/json-view/schemaValidator';
import { useAsyncValue } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import { Banner } from '../../core/ui/Banner';
import { runInWorker, WORKER_THRESHOLD_CHARS } from '../../core/worker/runInWorker';
import './json-editor.css';
import {
  applyEdit,
  computeStatus,
  parseIndentChoice,
  statusLabel,
  type EditAction,
  type EditorStatus,
  type IndentChoice,
} from './logic';
import { SchemaPanel } from './SchemaPanel';

type Notice = { kind: 'error' | 'info'; text: string } | null;

const ACTION_VERB: Record<EditAction['kind'], string> = {
  format: 'format',
  minify: 'minify',
  sortKeys: 'sort keys',
  repair: 'repair',
};

const createStatusWorker = () =>
  new Worker(new URL('./status.worker.ts', import.meta.url), { type: 'module' });

async function computeStatusAsync(text: string, signal: AbortSignal): Promise<EditorStatus> {
  return text.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<string, EditorStatus>(createStatusWorker, text, { signal })
    : computeStatus(text);
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function JsonEditorTool() {
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<IndentChoice>(2);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const status = useAsyncValue(useDebouncedValue(text, 150), computeStatusAsync);
  const debouncedSchema = useDebouncedValue(schemaText, 300);
  const schema = useMemo(() => createSchemaValidator(debouncedSchema), [debouncedSchema]);
  const validator = schemaOpen && schema?.ok ? schema.validator : undefined;

  useEffect(() => {
    if (notice?.kind !== 'info') return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  const run = (action: EditAction) => {
    const result = applyEdit(text, action);
    if (result.ok) {
      setText(result.text);
      setNotice(null);
    } else {
      setNotice({
        kind: 'error',
        text: `Can't ${ACTION_VERB[action.kind]}: ${describeParseError(result.error)}`,
      });
    }
  };

  const openFile = async (file: File) => {
    try {
      setText(await readFileAsText(file));
      setNotice(null);
    } catch (err) {
      setNotice({ kind: 'error', text: messageOf(err) });
    }
  };
  const { isOver, dropProps } = useFileDrop((file) => void openFile(file));

  const copy = async () => {
    try {
      await copyToClipboard(text);
      setNotice({ kind: 'info', text: 'Copied to clipboard' });
    } catch (err) {
      setNotice({ kind: 'error', text: messageOf(err) });
    }
  };

  const statusClass =
    status.status === 'done' && status.value.state !== 'empty'
      ? ` status-bar--${status.value.state}`
      : '';

  return (
    <div className="json-editor-tool">
      <div className="toolbar" role="toolbar" aria-label="JSON actions">
        <button type="button" onClick={() => run({ kind: 'format', indent })}>
          Format
        </button>
        <select
          aria-label="Indentation"
          value={indent === '\t' ? 'tab' : String(indent)}
          onChange={(e) => setIndent(parseIndentChoice(e.target.value))}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <button type="button" onClick={() => run({ kind: 'minify' })}>
          Minify
        </button>
        <button type="button" onClick={() => run({ kind: 'sortKeys', indent })}>
          Sort keys
        </button>
        <button type="button" onClick={() => run({ kind: 'repair' })}>
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
          data-testid="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => void copy()} disabled={text === ''}>
          Copy
        </button>
        <button
          type="button"
          onClick={() => downloadText('document.json', text)}
          disabled={text === ''}
        >
          Download
        </button>
        <button
          type="button"
          aria-pressed={schemaOpen}
          onClick={() => setSchemaOpen((open) => !open)}
        >
          Schema
        </button>
      </div>

      {notice && (
        <Banner kind={notice.kind} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}

      <div
        className={`json-editor-tool__workspace${isOver ? ' is-drop-target' : ''}`}
        {...dropProps}
      >
        <JsonEditorView value={text} onChange={setText} validator={validator} />
        {schemaOpen && <SchemaPanel value={schemaText} onChange={setSchemaText} result={schema} />}
      </div>

      <div className={`status-bar${statusClass}`} data-testid="status-bar" role="status">
        {status.status === 'done' && statusLabel(status.value)}
        {status.status === 'pending' && 'Checking…'}
        {status.status === 'error' && `Could not check the document: ${status.error.message}`}
      </div>
    </div>
  );
}
