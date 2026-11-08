import { useRef } from 'react';
import type { DiffSide } from '../../core/diff/structural';
import { CodeEditor } from '../../core/editor/CodeEditor';
import type { ParseError } from '../../core/formats/types';
import { useFileDrop } from '../../core/io/useFileDrop';

export function ComparePane({
  side,
  label,
  value,
  onChange,
  errors,
  onFile,
}: {
  side: DiffSide;
  label: string;
  value: string;
  onChange: (text: string) => void;
  errors: readonly ParseError[];
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { isOver, dropProps } = useFileDrop(onFile);
  return (
    <section
      className={`compare-pane${isOver ? ' is-drop-target' : ''}`}
      data-testid={`compare-${side}`}
      {...dropProps}
    >
      <div className="compare-pane__header">
        <strong>{label}</strong>
        <button type="button" onClick={() => input.current?.click()}>
          Open file
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          data-testid={`file-input-${side}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <CodeEditor
        value={value}
        onChange={onChange}
        language="json"
        errors={errors}
        ariaLabel={`${label} JSON`}
      />
    </section>
  );
}
