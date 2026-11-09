import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { detectOs, matchesShortcut } from './shortcuts';
import type { Command, Os } from './types';

/**
 * Registrations live in an external store so that re-registering on every render (new `run`
 * closures) never re-renders the provider: subscribers are only notified when the visible shape
 * of the command list changes, and exposed `run`s always call the latest closure.
 */
class CommandStore {
  private readonly owners = new Map<string, readonly Command[]>();
  private readonly listeners = new Set<() => void>();
  private signature = '';
  private snapshot: readonly Command[] = [];

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  set(owner: string, commands: readonly Command[] | null) {
    if (commands) this.owners.set(owner, commands);
    else this.owners.delete(owner);
    this.rebuild();
  }

  private latest(owner: string, id: string) {
    return this.owners.get(owner)?.find((c) => c.id === id)?.run;
  }

  private rebuild() {
    const shape: unknown[] = [];
    const flat: Command[] = [];
    for (const [owner, commands] of this.owners) {
      for (const c of commands) {
        shape.push([owner, c.id, c.title, c.group, c.shortcut, c.disabledReason, c.note, !!c.run]);
        flat.push(c.run ? { ...c, run: () => this.latest(owner, c.id)?.() } : c);
      }
    }
    const signature = JSON.stringify(shape);
    if (signature === this.signature) return;
    this.signature = signature;
    this.snapshot = flat;
    this.listeners.forEach((l) => l());
  }
}

interface Value {
  store: CommandStore;
  os: Os;
}

const CommandsContext = createContext<Value | null>(null);

function useValue(): Value {
  const value = useContext(CommandsContext);
  if (!value) throw new Error('CommandsProvider is missing');
  return value;
}

export function CommandsProvider({ children, os }: { children: ReactNode; os?: Os }) {
  const store = useMemo(() => new CommandStore(), []);
  const resolvedOs = useMemo(() => os ?? detectOs(), [os]);
  const value = useMemo(() => ({ store, os: resolvedOs }), [store, resolvedOs]);
  const osRef = useRef(resolvedOs);
  osRef.current = resolvedOs;

  // One window-level, capture-phase listener: it must win over editors (CodeMirror binds
  // Ctrl-K on macOS) and over the browser's own shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const command = store
        .getSnapshot()
        .find(
          (c) =>
            c.run &&
            !c.disabledReason &&
            c.shortcut &&
            matchesShortcut(e, c.shortcut, osRef.current),
        );
      if (!command) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      command.run?.();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [store]);

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>;
}

/** Registers commands while the calling component is mounted; re-registers on change. */
export function useRegisterCommands(commands: readonly Command[]): void {
  const { store } = useValue();
  const owner = useId();
  // Runs every render so `run` closures stay fresh; the store ignores shape-neutral updates.
  useEffect(() => {
    store.set(owner, commands);
  });
  useEffect(() => () => store.set(owner, null), [store, owner]);
}

export function useCommands(): readonly Command[] {
  const { store } = useValue();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useCommandsOs(): Os {
  return useValue().os;
}
