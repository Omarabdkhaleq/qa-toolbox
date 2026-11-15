import type { Command, Os, Shortcut } from '../../core/commands/types';
import type { FocusStep } from '../../core/diff/focus';

type Side = 'left' | 'right';

/** The slice of the JsonTool actions the palette needs. */
export interface JsonActions {
  format: (side: Side) => void;
  minify: (side: Side) => void;
  sortKeys: (side: Side) => void;
  repair: (side: Side) => void;
  swap: () => void;
  copy: (from: Side, to: Side) => void;
  toggleCompare: () => void;
  stepChange: (step: FocusStep) => void;
  openChanges: () => void;
  setSplit: (value: number) => void;
  resetSplit: () => void;
}

export interface JsonCommandState {
  /** The Compare checkbox value. */
  compareOn: boolean;
  /** Whether Compare is actually running (on, both sides open and valid). Defaults to `compareOn`. */
  compareActive?: boolean;
  /** Why Compare cannot be ticked right now. */
  compareReason?: string;
  changeCount: number;
  split: number;
}

export const STEP_NEXT: Shortcut = { ctrl: true, alt: true, key: 'ArrowDown' };
export const STEP_PREV: Shortcut = { ctrl: true, alt: true, key: 'ArrowUp' };

const OVERRIDE_NOTE =
  'Overrides the editor\'s "add cursor below/above" while Compare is on. On Ubuntu desktops the system uses these keys to switch workspaces — use the ↑/↓ buttons or this palette.';

const GROUP = 'JSON';
const KEYS = 'Keyboard reference';

const SIDE_TITLE: Record<Side, string> = { left: 'left', right: 'right' };

export function buildJsonCommands(
  state: JsonCommandState,
  actions: JsonActions,
  os: Os,
): Command[] {
  const active = state.compareActive ?? state.compareOn;
  const stepReason = !state.compareOn
    ? 'Turn on Compare first'
    : !active
      ? (state.compareReason ?? 'Compare is paused')
      : state.changeCount === 0
        ? 'No changes to step through'
        : undefined;

  const perSide = (id: 'format' | 'minify' | 'sortKeys' | 'repair', title: string): Command[] =>
    (['left', 'right'] as const).map((side) => ({
      id: `json.${id}.${side}`,
      title: `${title} ${SIDE_TITLE[side]}`,
      group: GROUP,
      run: () => actions[id](side),
    }));

  const ref = (id: string, title: string, shortcut: Shortcut, note?: string): Command => ({
    id: `json.keys.${id}`,
    title,
    group: KEYS,
    shortcut,
    note,
  });
  const mac = os === 'mac';

  return [
    ...perSide('format', 'Format'),
    ...perSide('minify', 'Minify'),
    ...perSide('sortKeys', 'Sort keys'),
    ...perSide('repair', 'Repair'),
    {
      id: 'json.compare.toggle',
      title: 'Toggle Compare',
      group: GROUP,
      run: actions.toggleCompare,
      disabledReason: state.compareOn ? undefined : state.compareReason,
    },
    {
      id: 'json.change.next',
      title: 'Next change',
      group: GROUP,
      shortcut: STEP_NEXT,
      run: () => actions.stepChange('next'),
      disabledReason: stepReason,
      note: os === 'other' ? OVERRIDE_NOTE : undefined,
    },
    {
      id: 'json.change.prev',
      title: 'Previous change',
      group: GROUP,
      shortcut: STEP_PREV,
      run: () => actions.stepChange('prev'),
      disabledReason: stepReason,
      note: os === 'other' ? OVERRIDE_NOTE : undefined,
    },
    {
      id: 'json.changes.show',
      title: 'Show changes',
      group: GROUP,
      run: actions.openChanges,
      disabledReason: !active
        ? 'Turn on Compare first'
        : state.changeCount === 0
          ? 'No changes to show'
          : undefined,
    },
    { id: 'json.swap', title: 'Swap sides', group: GROUP, run: actions.swap },
    {
      id: 'json.copy.leftToRight',
      title: 'Copy left to right',
      group: GROUP,
      run: () => actions.copy('left', 'right'),
    },
    {
      id: 'json.copy.rightToLeft',
      title: 'Copy right to left',
      group: GROUP,
      run: () => actions.copy('right', 'left'),
    },
    { id: 'json.split.reset', title: 'Reset split', group: GROUP, run: actions.resetSplit },
    {
      id: 'json.split.closeLeft',
      title: 'Close left editor',
      group: GROUP,
      run: () => actions.setSplit(0),
      disabledReason: state.split === 0 ? 'The left editor is already closed' : undefined,
    },
    {
      id: 'json.split.closeRight',
      title: 'Close right editor',
      group: GROUP,
      run: () => actions.setSplit(100),
      disabledReason: state.split === 100 ? 'The right editor is already closed' : undefined,
    },

    // Keyboard reference: read-only rows. Editor keys come from ADR 0002's key map.
    ref('split.left', 'Split handle: make left editor smaller', { key: 'ArrowLeft' }),
    ref('split.right', 'Split handle: make right editor smaller', { key: 'ArrowRight' }),
    ref('split.closeLeft', 'Split handle: close left editor', { key: 'Home' }),
    ref('split.closeRight', 'Split handle: close right editor', { key: 'End' }),
    ref('split.reset', 'Split handle: reset to 50/50', { key: 'Enter' }),
    ref('escape', 'Escape: close the Changes drawer or this palette', { key: 'Escape' }),
    ref('find', 'Find and replace in editor', { mod: true, key: 'f' }),
    ref('findNext', 'Find next', { mod: true, key: 'g' }),
    ref('findPrev', 'Find previous', { mod: true, shift: true, key: 'g' }),
    ref('undo', 'Undo', { mod: true, key: 'z' }),
    ref('redo', 'Redo', { mod: true, key: 'y' }),
    ref(
      'redoAlt',
      'Redo (alternative)',
      mac ? { mod: true, shift: true, key: 'z' } : { ctrl: true, shift: true, key: 'z' },
    ),
    ref('selectAll', 'Select all', { mod: true, key: 'a' }),
    ref('indent', 'Indent more', { key: 'Tab' }),
    ref('outdent', 'Indent less', { shift: true, key: 'Tab' }),
    ref('indentMore', 'Indent line more', { mod: true, key: ']' }),
    ref('indentLess', 'Indent line less', { mod: true, key: '[' }),
    ref(
      'fold',
      'Fold code',
      mac ? { mod: true, alt: true, key: '[' } : { ctrl: true, shift: true, key: '[' },
    ),
    ref(
      'unfold',
      'Unfold code',
      mac ? { mod: true, alt: true, key: ']' } : { ctrl: true, shift: true, key: ']' },
    ),
    ref('foldAll', 'Fold all', { ctrl: true, alt: true, key: '[' }),
    ref('unfoldAll', 'Unfold all', { ctrl: true, alt: true, key: ']' }),
    ref('selectNext', 'Select next occurrence', { mod: true, key: 'd' }),
    ref('goToLine', 'Go to line', { mod: true, alt: true, key: 'g' }),
    ref(
      'cursorBelow',
      'Add cursor below',
      { mod: true, alt: true, key: 'ArrowDown' },
      os === 'other' ? OVERRIDE_NOTE : undefined,
    ),
    ref(
      'cursorAbove',
      'Add cursor above',
      { mod: true, alt: true, key: 'ArrowUp' },
      os === 'other' ? OVERRIDE_NOTE : undefined,
    ),
    ...(mac ? [ref('deleteToLineEnd', 'Delete to end of line', { ctrl: true, key: 'k' })] : []),
  ];
}
