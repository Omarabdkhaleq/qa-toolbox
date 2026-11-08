import { useEffect, useMemo, useRef, useState } from 'react';
import { ChangeList } from '../../core/diff/ChangeList';
import type { Change, DiffSide } from '../../core/diff/structural';
import { TextDiffView, type TextDiffViewHandle } from '../../core/diff/TextDiffView';
import type { ParseError } from '../../core/formats/types';
import { readFileAsText } from '../../core/io/file';
import { useAsyncValue } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import { Banner } from '../../core/ui/Banner';
import { runInWorker, WORKER_THRESHOLD_CHARS } from '../../core/worker/runInWorker';
import { ComparePane } from './ComparePane';
import './json-compare.css';
import {
  compareJson,
  lineOfPath,
  sideOfChange,
  summaryText,
  type CompareInput,
  type CompareResult,
  type SideIssue,
} from './logic';

type Tab = 'changes' | 'text';

const createCompareWorker = () =>
  new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' });

async function compareAsync(input: CompareInput, signal: AbortSignal): Promise<CompareResult> {
  return input.left.length + input.right.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<CompareInput, CompareResult>(createCompareWorker, input, { signal })
    : compareJson(input);
}

const NO_ERRORS: readonly ParseError[] = [];
const errorsOf = (issue: SideIssue | null | undefined): readonly ParseError[] =>
  issue?.kind === 'invalid' ? [issue.error] : NO_ERRORS;

export default function JsonCompareTool() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [ignoreKeyOrder, setIgnoreKeyOrder] = useState(true);
  const [tab, setTab] = useState<Tab>('changes');
  const [jump, setJump] = useState<{ side: DiffSide; line: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const diffRef = useRef<TextDiffViewHandle>(null);

  const debouncedLeft = useDebouncedValue(left, 250);
  const debouncedRight = useDebouncedValue(right, 250);
  const input = useMemo<CompareInput>(
    () => ({ left: debouncedLeft, right: debouncedRight, options: { ignoreKeyOrder } }),
    [debouncedLeft, debouncedRight, ignoreKeyOrder],
  );
  const state = useAsyncValue(input, compareAsync);
  const result = state.status === 'done' ? state.value : null;

  const leftErrors = useMemo(() => errorsOf(result && !result.ok ? result.left : null), [result]);
  const rightErrors = useMemo(() => errorsOf(result && !result.ok ? result.right : null), [result]);

  useEffect(() => {
    if (tab !== 'text' || !jump) return;
    diffRef.current?.scrollToLine(jump.side, jump.line);
    setJump(null);
  }, [tab, jump]);

  const loadInto = (setter: (text: string) => void) => async (file: File) => {
    try {
      setter(await readFileAsText(file));
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    }
  };

  const selectChange = (change: Change) => {
    if (!result?.ok) return;
    const side = sideOfChange(change);
    const line = lineOfPath(side === 'left' ? result.leftText : result.rightText, change.path);
    if (line) setJump({ side, line });
    setTab('text');
  };

  return (
    <div className="json-compare-tool">
      <div className="toolbar" role="toolbar" aria-label="Compare actions">
        <label>
          <input
            type="checkbox"
            checked={ignoreKeyOrder}
            onChange={(e) => setIgnoreKeyOrder(e.target.checked)}
          />{' '}
          Ignore key order
        </label>
        <button
          type="button"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
        >
          Swap sides
        </button>
      </div>

      {fileError && (
        <Banner kind="error" onDismiss={() => setFileError(null)}>
          {fileError}
        </Banner>
      )}

      <div className="json-compare-tool__inputs">
        <ComparePane
          side="left"
          label="Left (original)"
          value={left}
          onChange={setLeft}
          errors={leftErrors}
          onFile={(f) => void loadInto(setLeft)(f)}
        />
        <ComparePane
          side="right"
          label="Right (changed)"
          value={right}
          onChange={setRight}
          errors={rightErrors}
          onFile={(f) => void loadInto(setRight)(f)}
        />
      </div>

      <div className="json-compare-tool__result">
        <div className="toolbar">
          <div role="tablist" aria-label="Result view">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'changes'}
              onClick={() => setTab('changes')}
            >
              Changes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'text'}
              onClick={() => setTab('text')}
            >
              Text diff
            </button>
          </div>
          {tab === 'text' && result?.ok && (
            <>
              <button
                type="button"
                aria-label="Previous change"
                onClick={() => diffRef.current?.prev()}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Next change"
                onClick={() => diffRef.current?.next()}
              >
                ↓
              </button>
            </>
          )}
          <span className="toolbar__spacer" />
          <span data-testid="compare-summary" role="status">
            {state.status === 'error'
              ? `Compare failed: ${state.error.message}`
              : summaryText(result)}
          </span>
        </div>
        {result?.ok && tab === 'changes' && (
          <ChangeList changes={result.changes} onSelect={selectChange} />
        )}
        {result?.ok && tab === 'text' && (
          <TextDiffView
            ref={diffRef}
            left={result.leftText}
            right={result.rightText}
            language="json"
          />
        )}
      </div>
    </div>
  );
}
