import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../core/commands/types';
import { CommandsProvider, useRegisterCommands } from '../core/commands/CommandsContext';
import { CommandPalette } from './CommandPalette';

function Harness({ commands }: { commands: readonly Command[] }) {
  const [open, setOpen] = useState(false);
  useRegisterCommands(commands);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function setup(commands: readonly Command[]) {
  render(
    <CommandsProvider>
      <Harness commands={commands} />
    </CommandsProvider>,
  );
}

describe('CommandPalette', () => {
  it('filters by typing, and runs the active command with Down + Enter', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    const other = vi.fn();
    setup([
      { id: 'a', title: 'Go to JSON', group: 'Navigation', run: other },
      { id: 'b', title: 'Toggle theme', group: 'App', run: toggle },
      { id: 'c', title: 'Another theme thing', group: 'App', run: other },
    ]);
    await user.click(screen.getByRole('button', { name: 'opener' }));
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog).toBeInTheDocument();
    const box = screen.getByRole('combobox');
    expect(box).toHaveFocus();
    await user.type(box, 'toggle');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(box);
    await user.type(box, 'theme');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Toggle theme'),
      expect.stringContaining('Another theme thing'),
    ]);
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs the second item after ArrowDown', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    setup([
      { id: 'a', title: 'Alpha theme', group: 'App', run: first },
      { id: 'b', title: 'Beta theme', group: 'App', run: second },
    ]);
    await user.click(screen.getByRole('button', { name: 'opener' }));
    await user.type(screen.getByRole('combobox'), 'theme{ArrowDown}{Enter}');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled reason and ignores Enter on that command', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    setup([
      { id: 'a', title: 'Compare', group: 'JSON', run, disabledReason: 'Paste JSON on both sides' },
    ]);
    await user.click(screen.getByRole('button', { name: 'opener' }));
    expect(screen.getByText('Paste JSON on both sides')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the previously focused element', async () => {
    const user = userEvent.setup();
    setup([{ id: 'a', title: 'Toggle theme', group: 'App', run: () => {} }]);
    const opener = screen.getByRole('button', { name: 'opener' });
    await user.click(opener);
    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('runs a command from its keyboard shortcut via the window listener', () => {
    const run = vi.fn();
    render(
      <CommandsProvider>
        <Harness
          commands={[
            { id: 'k', title: 'X', group: 'App', shortcut: { ctrl: true, key: 'j' }, run },
          ]}
        />
      </CommandsProvider>,
    );
    const event = new KeyboardEvent('keydown', {
      key: 'j',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
