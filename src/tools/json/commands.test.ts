import { describe, expect, it, vi } from 'vitest';
import { buildJsonCommands, type JsonActions } from './commands';

const actions = (): JsonActions => ({
  format: vi.fn(),
  minify: vi.fn(),
  sortKeys: vi.fn(),
  repair: vi.fn(),
  swap: vi.fn(),
  copy: vi.fn(),
  toggleCompare: vi.fn(),
  stepChange: vi.fn(),
  openChanges: vi.fn(),
  setSplit: vi.fn(),
  resetSplit: vi.fn(),
});
const off = { compareOn: false, changeCount: 0, split: 50 };
const on = { compareOn: true, changeCount: 3, split: 50 };
const find = (cmds: ReturnType<typeof buildJsonCommands>, id: string) =>
  cmds.find((c) => c.id === id);
const OVERRIDE_NOTE =
  'Overrides the editor\'s "add cursor below/above" while Compare is on. On Ubuntu desktops the system uses these keys to switch workspaces — use the ↑/↓ buttons or this palette.';

describe('buildJsonCommands', () => {
  it('disables next/previous change while Compare is off', () => {
    const cmds = buildJsonCommands(off, actions(), 'mac');
    expect(find(cmds, 'json.change.next')?.disabledReason).toBe('Turn on Compare first');
    expect(find(cmds, 'json.change.prev')?.disabledReason).toBe('Turn on Compare first');
    expect(find(cmds, 'json.change.next')?.shortcut).toEqual({
      ctrl: true,
      alt: true,
      key: 'ArrowDown',
    });
    expect(find(cmds, 'json.change.prev')?.shortcut?.key).toBe('ArrowUp');
  });

  it('enables stepping while Compare is on and steps', () => {
    const a = actions();
    const cmds = buildJsonCommands(on, a, 'mac');
    const next = find(cmds, 'json.change.next');
    expect(next?.disabledReason).toBeUndefined();
    next?.run?.();
    find(cmds, 'json.change.prev')?.run?.();
    expect(a.stepChange).toHaveBeenNthCalledWith(1, 'next');
    expect(a.stepChange).toHaveBeenNthCalledWith(2, 'prev');
  });

  it('leaves the keys to the editor when there is nothing to step through', () => {
    const cmds = buildJsonCommands({ ...on, changeCount: 0 }, actions(), 'other');
    expect(find(cmds, 'json.change.next')?.disabledReason).toBeTruthy();
  });

  it('adds the override note on Windows/Linux only', () => {
    expect(find(buildJsonCommands(off, actions(), 'other'), 'json.change.next')?.note).toBe(
      OVERRIDE_NOTE,
    );
    expect(
      find(buildJsonCommands(off, actions(), 'mac'), 'json.change.next')?.note,
    ).toBeUndefined();
  });

  it('has unique ids and the spec §3a commands', () => {
    const cmds = buildJsonCommands(on, actions(), 'other');
    const ids = cmds.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'json.format.left',
      'json.format.right',
      'json.minify.left',
      'json.sortKeys.right',
      'json.repair.left',
      'json.compare.toggle',
      'json.changes.show',
      'json.swap',
      'json.copy.leftToRight',
      'json.copy.rightToLeft',
      'json.split.reset',
      'json.split.closeLeft',
      'json.split.closeRight',
    ])
      expect(ids).toContain(id);
  });

  it('runs per-side, copy and split commands', () => {
    const a = actions();
    const cmds = buildJsonCommands(on, a, 'other');
    find(cmds, 'json.format.left')?.run?.();
    find(cmds, 'json.repair.right')?.run?.();
    find(cmds, 'json.copy.leftToRight')?.run?.();
    find(cmds, 'json.copy.rightToLeft')?.run?.();
    find(cmds, 'json.split.closeLeft')?.run?.();
    find(cmds, 'json.split.closeRight')?.run?.();
    find(cmds, 'json.split.reset')?.run?.();
    find(cmds, 'json.changes.show')?.run?.();
    find(cmds, 'json.swap')?.run?.();
    find(cmds, 'json.compare.toggle')?.run?.();
    expect(a.format).toHaveBeenCalledWith('left');
    expect(a.repair).toHaveBeenCalledWith('right');
    expect(a.copy).toHaveBeenNthCalledWith(1, 'left', 'right');
    expect(a.copy).toHaveBeenNthCalledWith(2, 'right', 'left');
    expect(a.setSplit).toHaveBeenNthCalledWith(1, 0);
    expect(a.setSplit).toHaveBeenNthCalledWith(2, 100);
    expect(a.resetSplit).toHaveBeenCalled();
    expect(a.openChanges).toHaveBeenCalled();
    expect(a.swap).toHaveBeenCalled();
    expect(a.toggleCompare).toHaveBeenCalled();
  });

  it('gates Compare, Show changes and split commands on state', () => {
    const blocked = buildJsonCommands(
      {
        compareOn: false,
        compareReason: 'Paste JSON on both sides to compare',
        changeCount: 0,
        split: 0,
      },
      actions(),
      'other',
    );
    expect(find(blocked, 'json.compare.toggle')?.disabledReason).toBe(
      'Paste JSON on both sides to compare',
    );
    expect(find(blocked, 'json.changes.show')?.disabledReason).toBeTruthy();
    expect(find(blocked, 'json.split.closeLeft')?.disabledReason).toBeTruthy();
    expect(find(blocked, 'json.split.closeRight')?.disabledReason).toBeUndefined();
    const paused = buildJsonCommands(
      {
        compareOn: true,
        compareActive: false,
        compareReason: 'Fix the JSON errors to compare',
        changeCount: 0,
        split: 50,
      },
      actions(),
      'other',
    );
    expect(find(paused, 'json.compare.toggle')?.disabledReason).toBeUndefined();
    expect(find(paused, 'json.change.next')?.disabledReason).toBe('Fix the JSON errors to compare');
  });

  it('lists keyboard-reference rows that cannot run', () => {
    const cmds = buildJsonCommands(off, actions(), 'other');
    const rows = cmds.filter((c) => !c.run);
    expect(rows.length).toBeGreaterThan(10);
    expect(new Set(rows.map((r) => r.group))).toEqual(new Set(['Keyboard reference']));
    const titles = rows.map((r) => r.title).join('|');
    for (const t of ['Find', 'Undo', 'Redo', 'Select all', 'Escape', 'Add cursor below'])
      expect(titles).toContain(t);
    expect(
      buildJsonCommands(off, actions(), 'mac').some((c) => c.id === 'json.keys.deleteToLineEnd'),
    ).toBe(true);
    expect(rows.some((c) => c.id === 'json.keys.deleteToLineEnd')).toBe(false);
  });
});
