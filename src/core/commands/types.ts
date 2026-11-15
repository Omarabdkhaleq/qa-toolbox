export type Os = 'mac' | 'other';

/** OS-neutral shortcut: `mod` is ⌘ on macOS and Ctrl elsewhere. */
export interface Shortcut {
  mod?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  key: string;
}

export interface Command {
  id: string;
  title: string;
  group: string;
  shortcut?: Shortcut;
  /** Absent = keyboard-reference row (listed, never runnable). */
  run?: () => void;
  /** When set the command is shown but cannot run. */
  disabledReason?: string;
  note?: string;
}
