import { CodeEditor } from '../../core/editor/CodeEditor';
import type { SchemaValidatorResult } from '../../core/json-view/schemaValidator';

export function SchemaPanel({
  value,
  onChange,
  result,
  testId = 'schema-editor',
}: {
  value: string;
  onChange: (text: string) => void;
  result: SchemaValidatorResult | null;
  testId?: string;
}) {
  return (
    <aside className="schema-panel" aria-label="JSON Schema">
      <div className="schema-panel__header">
        <strong>JSON Schema</strong>
        {result === null && (
          <span className="schema-panel__hint">Paste a schema to validate the document</span>
        )}
        {result?.ok && <span className="schema-panel__ok">Validating</span>}
        {result && !result.ok && (
          <span className="schema-panel__error" role="alert">
            {result.error}
          </span>
        )}
      </div>
      <CodeEditor
        value={value}
        onChange={onChange}
        language="json"
        ariaLabel="JSON Schema editor"
        testId={testId}
      />
    </aside>
  );
}
