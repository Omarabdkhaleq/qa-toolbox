import { useId, type Ref } from 'react';
import type { FocusStep } from '../../core/diff/focus';
import { SplitHandle } from './SplitHandle';

export interface CompareControls {
  on: boolean;
  /** Why Compare cannot be used right now; undefined when it can. */
  reason?: string;
  /** null hides the summary (Compare off or inactive). */
  summary: string | null;
  /** "Change k of N"; null hides it. */
  position: string | null;
  canStep: boolean;
  truncationNote: string | null;
  /** Number of changes the drawer lists. */
  changeCount: number;
}

export function MiddleMenu({
  onSwap,
  onCopy,
  split,
  onSplit,
  onResetSplit,
  compare,
  onToggleCompare,
  onStep,
  onOpenChanges,
  changesButtonRef,
}: {
  split: number;
  onSplit: (value: number) => void;
  onResetSplit: () => void;
  onSwap: () => void;
  onCopy: (from: 'left' | 'right', to: 'left' | 'right') => void;
  compare: CompareControls;
  onToggleCompare: () => void;
  onStep: (step: FocusStep) => void;
  onOpenChanges: () => void;
  changesButtonRef: Ref<HTMLButtonElement>;
}) {
  const reasonId = useId();
  return (
    <div className="json-menu" role="group" aria-label="Compare controls">
      <SplitHandle split={split} onSplit={onSplit} onReset={onResetSplit} />
      <div className="json-menu__compare">
        <label className="json-menu__toggle">
          <input
            type="checkbox"
            checked={compare.on}
            disabled={compare.reason !== undefined}
            aria-describedby={compare.reason ? reasonId : undefined}
            onChange={onToggleCompare}
          />
          Compare
        </label>
        {compare.reason && (
          <p id={reasonId} className="json-menu__hint">
            {compare.reason}
          </p>
        )}
        {compare.summary !== null && (
          <p className="json-menu__summary" data-testid="compare-summary" role="status">
            {compare.summary}
          </p>
        )}
        {compare.on && (
          <div className="json-menu__steps">
            <button
              type="button"
              aria-label="Previous change"
              title="Previous change"
              disabled={!compare.canStep}
              onClick={() => onStep('prev')}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Next change"
              title="Next change"
              disabled={!compare.canStep}
              onClick={() => onStep('next')}
            >
              ↓
            </button>
            {compare.position && (
              <span className="diff-focus" data-testid="diff-focus" aria-live="polite">
                {compare.position}
              </span>
            )}
          </div>
        )}
        <button
          ref={changesButtonRef}
          type="button"
          disabled={!compare.on || compare.summary === null || compare.changeCount === 0}
          onClick={onOpenChanges}
        >
          Changes ({compare.changeCount})
        </button>
        {compare.truncationNote && (
          <p className="json-menu__hint" role="note">
            {compare.truncationNote}
          </p>
        )}
      </div>
      <button type="button" onClick={onSwap}>
        Swap sides
      </button>
      <button type="button" onClick={() => onCopy('left', 'right')}>
        Copy left to right
      </button>
      <button type="button" onClick={() => onCopy('right', 'left')}>
        Copy right to left
      </button>
    </div>
  );
}
