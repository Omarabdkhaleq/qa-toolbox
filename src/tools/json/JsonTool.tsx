import { useEffect, useMemo, useRef, useState } from 'react';
import { useCommandsOs, useRegisterCommands } from '../../core/commands/CommandsContext';
import { formatShortcut } from '../../core/commands/shortcuts';
import { buildJsonCommands, STEP_NEXT, STEP_PREV } from './commands';
import { focusLabel, stepFocus, type FocusStep } from '../../core/diff/focus';
import type { Change } from '../../core/diff/structural';
import { describeParseError } from '../../core/formats/errors';
import { copyToClipboard } from '../../core/io/clipboard';
import type { JsonEditorMode, JsonEditorViewHandle } from '../../core/json-view/JsonEditorView';
import { useAsyncValue, type AsyncState } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import { runInWorker, WORKER_THRESHOLD_CHARS } from '../../core/worker/runInWorker';
import { EditorPane, type Notice, type Side } from './EditorPane';
import './json.css';
import {
  applyEdit,
  changeTargets,
  compareAvailability,
  compareJson,
  computeStatus,
  highlightsFor,
  MAX_HIGHLIGHTED_CHANGES,
  summaryText,
  type CompareInput,
  type CompareResult,
  type EditAction,
  type EditorStatus,
  type EditResult,
  type IndentChoice,
} from './logic';
import { ChangesDrawer } from './ChangesDrawer';
import { MiddleMenu } from './MiddleMenu';

const createStatusWorker = () =>
  new Worker(new URL('./status.worker.ts', import.meta.url), { type: 'module' });
const createCompareWorker = () =>
  new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' });
const createEditWorker = () =>
  new Worker(new URL('./edit.worker.ts', import.meta.url), { type: 'module' });

/** The status together with the text it describes, so a stale status can be told apart. */
interface TextStatus {
  text: string;
  status: EditorStatus;
}

async function computeStatusAsync(text: string, signal: AbortSignal): Promise<TextStatus> {
  const status =
    text.length > WORKER_THRESHOLD_CHARS
      ? await runInWorker<string, EditorStatus>(createStatusWorker, text, { signal })
      : computeStatus(text);
  return { text, status };
}

/** `null` input = Compare is off. */
async function compareAsync(
  input: CompareInput | null,
  signal: AbortSignal,
): Promise<CompareResult | null> {
  if (!input) return null;
  return input.left.length + input.right.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<CompareInput, CompareResult>(createCompareWorker, input, { signal })
    : compareJson(input);
}

async function sortKeysAsync(text: string, indent: IndentChoice): Promise<EditResult> {
  const action: EditAction = { kind: 'sortKeys', indent };
  return text.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<{ text: string; action: EditAction }, EditResult>(createEditWorker, {
        text,
        action,
      })
    : applyEdit(text, action);
}

const SIDES: readonly Side[] = ['left', 'right'];
const NO_CHANGES: readonly Change[] = [];
const SPLIT_CLOSED_REASON = 'Open both editors to compare';
const EMPTY_STATUS: EditorStatus = { state: 'empty' };
const statusOf = (s: AsyncState<TextStatus>): EditorStatus =>
  s.status === 'done' ? s.value.status : EMPTY_STATUS;
const paneStatus = (s: AsyncState<TextStatus>): AsyncState<EditorStatus> =>
  s.status === 'done' ? { status: 'done', value: s.value.status } : s;
const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, '\n').trim();

interface SideState {
  text: string;
  indent: IndentChoice;
  schemaOpen: boolean;
  schemaText: string;
  mode: JsonEditorMode;
  notice: Notice;
  /** Where the latest text came from: typed in the editor, or replaced from outside it. */
  lastChange: 'editor' | 'external';
}

const initialSide = (): SideState => ({
  text: '',
  indent: 2,
  schemaOpen: false,
  schemaText: '',
  mode: 'text',
  notice: null,
  lastChange: 'external',
});

const ACTION_VERB: Record<EditAction['kind'], string> = {
  format: 'format',
  minify: 'minify',
  sortKeys: 'sort keys',
  repair: 'repair',
};

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function JsonTool() {
  const [sides, setSides] = useState<Record<Side, SideState>>({
    left: initialSide(),
    right: initialSide(),
  });
  const [split, setSplitState] = useState(50);
  const setSplit = (value: number) => setSplitState(Math.min(100, Math.max(0, value)));
  const resetSplit = () => setSplitState(50);
  const compareAvailable = split > 0 && split < 100;
  const refs = {
    left: useRef<JsonEditorViewHandle>(null),
    right: useRef<JsonEditorViewHandle>(null),
  };

  // ---- Compare state ----
  const [compareOn, setCompareOn] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  // True for two frames when the focused change is re-focused, so its outline pulses again.
  const [repulsing, setRepulsing] = useState(false);
  // Edited by the user since the last sort; such a side re-sorts once when its editor loses focus.
  const dirty = useRef<Record<Side, boolean>>({ left: false, right: false });
  // Text just pasted into each editor; a paste that becomes the whole document is sorted.
  const pasted = useRef<Record<Side, string | null>>({ left: null, right: null });

  const statuses = {
    left: useAsyncValue(useDebouncedValue(sides.left.text, 150), computeStatusAsync),
    right: useAsyncValue(useDebouncedValue(sides.right.text, 150), computeStatusAsync),
  };
  const [focusedSide, setFocusedSide] = useState<Side | null>(null);
  const availability = compareAvailability(statusOf(statuses.left), statusOf(statuses.right));
  // A status still describing older text (or that failed) is not acted on yet, except on error.
  const settled = (side: Side) => {
    const s = statuses[side];
    return s.status === 'error' || (s.status === 'done' && s.value.text === sides[side].text);
  };
  // A side that became empty or invalid while the user types in it only pauses Compare. Once it
  // is broken and not being typed in (focus left, or the change came from outside the editor),
  // Compare turns off and the user re-ticks it after fixing.
  const turnsOff = SIDES.some(
    (side) =>
      statusOf(statuses[side]).state !== 'valid' &&
      settled(side) &&
      !(side === focusedSide && sides[side].lastChange === 'editor'),
  );
  if (compareOn && !availability.ok && turnsOff) {
    setCompareOn(false);
    setFocusIndex(null);
  }
  const compareReason = !availability.ok
    ? availability.reason
    : compareAvailable
      ? undefined
      : SPLIT_CLOSED_REASON;
  // With a side closed by the split, Compare keeps its value but does nothing until it reopens;
  // while a side is empty or invalid (paused), it does nothing either.
  const compareActive = compareOn && compareAvailable && availability.ok;

  const debouncedLeft = useDebouncedValue(sides.left.text, 250);
  const debouncedRight = useDebouncedValue(sides.right.text, 250);
  const compareInput = useMemo<CompareInput | null>(
    () => (compareActive ? { left: debouncedLeft, right: debouncedRight } : null),
    [compareActive, debouncedLeft, debouncedRight],
  );
  const compareState = useAsyncValue(compareInput, compareAsync);
  const compareResult = compareActive && compareState.status === 'done' ? compareState.value : null;
  const changes = compareResult?.ok ? compareResult.changes : NO_CHANGES;
  const highlights = useMemo(
    () => (compareResult?.ok ? highlightsFor(compareResult.changes) : null),
    [compareResult],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const changesButton = useRef<HTMLButtonElement>(null);
  const compareBox = useRef<HTMLInputElement>(null);
  // The drawer closes (and stays closed) when Compare pauses or turns off, or nothing differs.
  if (drawerOpen && !(compareActive && changes.length > 0)) setDrawerOpen(false);
  // For the drawer's focus fallback, which runs after this render has committed.
  const brokenSide = useRef<Side | null>(null);
  useEffect(() => {
    brokenSide.current =
      SIDES.find((side) => statusOf(statuses[side]).state !== 'valid') ?? focusedSide;
  });
  const focus = focusIndex !== null && focusIndex < changes.length ? focusIndex : null;
  const focusedChange = focus !== null ? changes[focus] : undefined;
  const targets = focusedChange && !repulsing ? changeTargets(focusedChange) : null;

  const patch = (side: Side, change: Partial<SideState>) =>
    setSides((s) => ({ ...s, [side]: { ...s[side], ...change } }));
  // The editor debounces onChange, so actions read its live content instead of the state.
  const liveText = (side: Side) => refs[side].current?.getText() ?? sides[side].text;

  /** While Compare is on, a whole-document replacement is sorted (left as is if it is not valid JSON). */
  const sortedIfComparing = (side: Side, text: string) => {
    if (!compareOn) return text;
    const result = applyEdit(text, { kind: 'sortKeys', indent: sides[side].indent });
    return result.ok ? result.text : text;
  };
  const replace = (side: Side, text: string) => {
    dirty.current[side] = false;
    patch(side, { text: sortedIfComparing(side, text), notice: null, lastChange: 'external' });
  };

  /** Sorts an editor's live text (in a worker when large); leaves it alone if it changed meanwhile. */
  const sortLive = async (side: Side): Promise<boolean> => {
    const source = liveText(side);
    let result: EditResult;
    try {
      result = await sortKeysAsync(source, sides[side].indent);
    } catch {
      return false;
    }
    if (!result.ok) return false;
    // Edited while sorting (only possible for large, worker-sorted text): keep the edit; blur sorts later.
    if (liveText(side) !== source) return true;
    dirty.current[side] = false;
    if (result.text !== source) patch(side, { text: result.text });
    return true;
  };

  const onEdit = (side: Side, text: string) => {
    const paste = pasted.current[side];
    pasted.current[side] = null;
    if (compareOn && paste !== null && normalizeNewlines(paste) === normalizeNewlines(text)) {
      // Pasted in the editor, so it still counts as typing there.
      dirty.current[side] = false;
      patch(side, { text: sortedIfComparing(side, text), notice: null, lastChange: 'editor' });
      return;
    }
    dirty.current[side] = true;
    patch(side, { text, lastChange: 'editor' });
  };

  const onEditorBlur = (side: Side) => {
    setFocusedSide((current) => (current === side ? null : current));
    if (compareOn && dirty.current[side]) void sortLive(side);
  };

  /** The drawer closed while it had focus: move focus somewhere useful instead of the page. */
  const onDrawerFocusLost = () =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      // Something already took focus (an explicit close returns it to the Changes button).
      if (active && active !== document.body) return;
      const box = compareBox.current;
      if (box && !box.disabled) box.focus();
      else refs[brokenSide.current ?? 'left'].current?.focus();
    });

  const toggleCompare = () => {
    setFocusIndex(null);
    if (compareOn) {
      setCompareOn(false);
      return;
    }
    if (compareReason) return;
    setCompareOn(true);
    void Promise.all(SIDES.map(sortLive)).then((sorted) => {
      // The live text was not valid after all (its status had not caught up yet).
      if (sorted.includes(false)) setCompareOn(false);
    });
  };

  const focusChange = (index: number) => {
    const change = changes[index];
    if (!change) return;
    if (index === focus) {
      setRepulsing(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setRepulsing(false)));
    }
    setFocusIndex(index);
    const target = changeTargets(change);
    for (const side of SIDES) {
      const path = target[side].scroll;
      // Scrolling is best effort; a path the editor cannot reach leaves it where it is.
      if (path) void refs[side].current?.scrollToPath(path).catch(() => undefined);
    }
  };

  const stepChange = (step: FocusStep) => {
    if (!compareActive) return;
    const next = stepFocus(focus, changes.length, step);
    if (next !== null) focusChange(next);
  };

  const run = (side: Side, kind: EditAction['kind']) => {
    const action: EditAction =
      kind === 'format' || kind === 'sortKeys' ? { kind, indent: sides[side].indent } : { kind };
    const result = applyEdit(liveText(side), action);
    // Minify keeps key order, so it needs no re-sort (and sorting would undo it).
    if (result.ok && kind === 'minify') patch(side, { text: result.text, notice: null });
    else if (result.ok) replace(side, result.text);
    else
      patch(side, {
        notice: {
          kind: 'error',
          text: `Can't ${ACTION_VERB[kind]}: ${describeParseError(result.error)}`,
        },
      });
  };

  // Per-side actions and compare actions; later tasks (drawer, command palette) call these.
  const actions = {
    format: (side: Side) => run(side, 'format'),
    minify: (side: Side) => run(side, 'minify'),
    sortKeys: (side: Side) => run(side, 'sortKeys'),
    repair: (side: Side) => run(side, 'repair'),
    swap: () => {
      const left = sortedIfComparing('left', liveText('right'));
      const right = sortedIfComparing('right', liveText('left'));
      dirty.current = { left: false, right: false };
      setSides((s) => ({
        left: { ...s.left, text: left, lastChange: 'external' },
        right: { ...s.right, text: right, lastChange: 'external' },
      }));
    },
    copy: (from: Side, to: Side) => {
      dirty.current[to] = false;
      patch(to, { text: sortedIfComparing(to, liveText(from)), lastChange: 'external' });
    },
    toggleCompare,
    openChanges: () => setDrawerOpen(true),
    closeChanges: () => {
      setDrawerOpen(false);
      // The drawer unmounts on this render; return focus once it has.
      requestAnimationFrame(() => changesButton.current?.focus());
    },
    stepChange,
    focusChange,
  };
  const os = useCommandsOs();
  useRegisterCommands(
    buildJsonCommands(
      {
        compareOn,
        compareActive,
        compareReason,
        changeCount: changes.length,
        split,
      },
      { ...actions, setSplit, resetSplit },
      os,
    ),
  );
  const truncationNote = highlights?.truncated
    ? `Highlighting the first ${MAX_HIGHLIGHTED_CHANGES.toLocaleString('en-US')} of ${highlights.total.toLocaleString('en-US')} changes`
    : null;
  const summary =
    compareState.status === 'error'
      ? `Compare failed: ${compareState.error.message}`
      : summaryText(compareResult);

  const copyToClipboardOf = async (side: Side) => {
    try {
      await copyToClipboard(liveText(side));
      patch(side, { notice: { kind: 'info', text: 'Copied to clipboard' } });
    } catch (err) {
      patch(side, { notice: { kind: 'error', text: messageOf(err) } });
    }
  };

  const leftNotice = sides.left.notice;
  const rightNotice = sides.right.notice;
  useEffect(() => {
    if (leftNotice?.kind !== 'info') return;
    const timer = setTimeout(() => patch('left', { notice: null }), 2000);
    return () => clearTimeout(timer);
  }, [leftNotice]);
  useEffect(() => {
    if (rightNotice?.kind !== 'info') return;
    const timer = setTimeout(() => patch('right', { notice: null }), 2000);
    return () => clearTimeout(timer);
  }, [rightNotice]);

  const pane = (side: Side) => (
    <EditorPane
      key={side}
      side={side}
      hidden={(side === 'left' && split === 0) || (side === 'right' && split === 100)}
      ref={refs[side]}
      text={sides[side].text}
      onTextChange={(text) => onEdit(side, text)}
      onReplaceText={(text) => replace(side, text)}
      status={paneStatus(statuses[side])}
      indent={sides[side].indent}
      onIndentChange={(indent) => patch(side, { indent })}
      mode={sides[side].mode}
      onModeChange={(mode) => patch(side, { mode })}
      schemaOpen={sides[side].schemaOpen}
      onSchemaOpenChange={(schemaOpen) => patch(side, { schemaOpen })}
      schemaText={sides[side].schemaText}
      onSchemaTextChange={(schemaText) => patch(side, { schemaText })}
      notice={sides[side].notice}
      onNotice={(notice) => patch(side, { notice })}
      onRun={(kind) => run(side, kind)}
      onCopy={() => void copyToClipboardOf(side)}
      getText={() => liveText(side)}
      highlights={highlights?.[side]}
      focusPath={targets?.[side].focus ?? null}
      showTableNote={compareActive}
      onEditorFocus={() => setFocusedSide(side)}
      onEditorBlur={() => onEditorBlur(side)}
      onEditorPaste={(text) => {
        pasted.current[side] = text;
      }}
    />
  );

  return (
    <div className="json-root">
      <div
        className="json-tool"
        style={{ gridTemplateColumns: `minmax(0, ${split}fr) auto minmax(0, ${100 - split}fr)` }}
      >
        {pane('left')}
        <MiddleMenu
          onSwap={actions.swap}
          onCopy={actions.copy}
          split={split}
          onSplit={setSplit}
          onResetSplit={resetSplit}
          compare={{
            on: compareOn,
            reason: compareReason,
            summary: compareActive ? summary : null,
            position:
              compareActive && changes.length > 0 ? focusLabel(focus, changes.length) : null,
            canStep: compareActive && changes.length > 0,
            truncationNote: compareActive ? truncationNote : null,
            changeCount: changes.length,
          }}
          onToggleCompare={actions.toggleCompare}
          onStep={actions.stepChange}
          stepHints={{
            next: formatShortcut(STEP_NEXT, os),
            prev: formatShortcut(STEP_PREV, os),
          }}
          onOpenChanges={actions.openChanges}
          changesButtonRef={changesButton}
          compareBoxRef={compareBox}
        />
        {pane('right')}
      </div>
      {drawerOpen && (
        <ChangesDrawer
          changes={changes}
          onSelect={actions.focusChange}
          onClose={actions.closeChanges}
          onFocusLost={onDrawerFocusLost}
        />
      )}
    </div>
  );
}
