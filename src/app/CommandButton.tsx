import { useCommandsOs } from '../core/commands/CommandsContext';
import { formatShortcut } from '../core/commands/shortcuts';
import './command-palette.css';

export function CommandButton({ onClick }: { onClick: () => void }) {
  const os = useCommandsOs();
  const shortcut = formatShortcut({ mod: true, key: 'k' }, os);
  return (
    <button
      type="button"
      className="command-button"
      aria-label="Commands and shortcuts"
      title={`Commands and shortcuts (${shortcut})`}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path
          d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <kbd className="key-chip">{shortcut}</kbd>
    </button>
  );
}
