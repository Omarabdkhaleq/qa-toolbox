import './diff.css';
import { CHANGE_LABELS, describeChange } from './format';
import { toJsonPath } from './paths';
import type { Change } from './structural';

export function ChangeList({
  changes,
  onSelect,
  limit = 1000,
}: {
  changes: readonly Change[];
  onSelect?: (change: Change) => void;
  limit?: number;
}) {
  const shown = changes.slice(0, limit);
  return (
    <div className="change-list">
      <ul aria-label="Changes">
        {shown.map((change, i) => (
          <li key={i}>
            <button
              type="button"
              className={`change change--${change.kind}`}
              onClick={() => onSelect?.(change)}
            >
              <span className="change__kind">{CHANGE_LABELS[change.kind]}</span>{' '}
              <code className="change__path">{toJsonPath(change.path)}</code>{' '}
              <span className="change__detail">{describeChange(change)}</span>
            </button>
          </li>
        ))}
      </ul>
      {changes.length > limit && (
        <p className="change-list__more">
          Showing the first {limit} of {changes.length} changes.
        </p>
      )}
    </div>
  );
}
