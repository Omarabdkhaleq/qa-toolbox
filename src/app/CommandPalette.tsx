import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useCommands, useCommandsOs } from '../core/commands/CommandsContext';
import { formatShortcut } from '../core/commands/shortcuts';
import type { Command } from '../core/commands/types';
import './command-palette.css';

/** Matching commands; keyboard-reference rows (never runnable) come after the commands. */
function filterCommands(commands: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = commands.filter((c) => {
    const haystack = `${c.title} ${c.group}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  return [...matches.filter((c) => c.run), ...matches.filter((c) => !c.run)];
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <PaletteDialog onClose={onClose} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const commands = useCommands();
  const os = useCommandsOs();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const items = useMemo(() => filterCommands(commands, query), [commands, query]);
  const current = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // Focus the search box; give focus back to whatever had it when the palette closes.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const run = (command: Command | undefined) => {
    if (!command?.run || command.disabledReason) return;
    onClose();
    command.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(items.length ? (current + 1) % items.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(items.length ? (current - 1 + items.length) % items.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[current]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus in the dialog
    }
  };

  return (
    <div
      className="palette__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        // Keep focus in the search box when a non-focusable part is clicked, so the
        // keyboard handling and the focus trap keep working.
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <input
          ref={inputRef}
          className="palette__input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items.length ? optionId(current) : undefined}
          aria-autocomplete="list"
          aria-label="Search commands"
          placeholder="Type a command…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <ul className="palette__list" role="listbox" id={listId} aria-label="Commands">
          {items.map((c, i) => {
            const unavailable = !c.run || !!c.disabledReason;
            return (
              <li
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                aria-disabled={unavailable || undefined}
                className="palette__item"
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
              >
                <span className="palette__text">
                  <span className="palette__title">{c.title}</span>
                  {(c.disabledReason || c.note) && (
                    <span className="palette__note">{c.disabledReason ?? c.note}</span>
                  )}
                </span>
                <span className="palette__group">{c.group}</span>
                {c.shortcut && <kbd className="key-chip">{formatShortcut(c.shortcut, os)}</kbd>}
              </li>
            );
          })}
          {items.length === 0 && <li className="palette__empty">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}
