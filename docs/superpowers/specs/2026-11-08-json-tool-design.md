# JSON tool — design

> Status: **approved** (2026-11-08), revised the same day after plan review (comments dropped, command palette added, text compare deferred to the Text tools milestone). Supersedes intent.md §4.1 (JSON Editor) and §4.2 (JSON Compare); everything else in `intent.md` (privacy, offline, CSP, budgets, testing, delivery) still applies.
> Decisions marked **(user)** were made by the product owner; **(builder's call)** were made while writing this and can be revisited.

## 1. Intent

Today qa-toolbox has two separate tools: **JSON Editor** (one editor with format/repair/schema) and **JSON Compare** (two plain panes plus a separate result area). Working with two payloads means switching tools and pasting twice, and the compare result lives in a third view instead of where the user typed.

The new **JSON** tool is **one tool** **(user)**: two full editors side by side, the way jsoneditoronline.org does. Each side can be formatted, repaired, validated and viewed as text / tree / table on its own, and ticking **Compare** highlights the differences *in place*, in the same editors the user pasted into. A **Changes** drawer lists the differences, and a draggable divider resizes the editors or closes one entirely. A floating **command palette** (⌘K / Ctrl+K) lists every command and keyboard shortcut.

### Success looks like
1. One sidebar entry, **JSON** **(user)**, replaces JSON Editor and JSON Compare.
2. Paste two payloads, tick **Compare**, and see differences highlighted in both editors in text, tree and table views **(user)**.
3. JSON containing comments is reported clearly as unsupported, with Repair as the one-click fix **(user)**.
4. Every action is reachable and discoverable from the keyboard through the command palette, with shortcuts shown for the user's OS **(user)**.
5. All existing guarantees still hold: no network egress, strict CSP, lossless big numbers, BOM/binary handling, budgets.

## 2. Goals, non-goals, anti-goals

**Goals**
- Two equal, independent editors with the full JSON Editor toolbar each.
- In-place, structural compare across text, tree and table views, toggled by a checkbox.
- Changes drawer, step-through navigation, resizable/collapsible split.
- Command palette with an OS-aware keyboard reference.
- Readable in light and dark themes (WCAG AA).

**Non-goals (this version)**
- **Comments in JSON** (`//`, `/* */`): invalid for now; support is on the roadmap **(user)**. See §4.
- Other JSON5/JSONC features (unquoted keys, single quotes, trailing commas as *valid* JSON). Repair still fixes those on request, as today.
- A raw, line-by-line **text** compare. It belongs to the Text tools milestone (roadmap v1.1), which reuses `TextDiffView` **(user)**. JSON compare is structural only.
- Customisable key bindings.
- Remembering split position, closed side or contents across reloads (persistence is roadmap v1.4) **(user)**.

**Anti-goals — failure even if it technically works**
- Whitespace, formatting or key order showing up as differences.
- Highlights or text that are hard to read in either theme, or differences conveyed by color alone.
- Any data leaving the browser, or a CSP relaxation (`unsafe-eval`) to make this work.
- Big integers rounded or `__proto__` keys lost anywhere in the new flow.
- Repair or any automatic step silently changing data the user did not ask to change.

## 3. Layout and controls

```
┌──────────────────────────── JSON ────────────────────────────┐
│ [left toolbar]          │ middle  │          [right toolbar] │
│ Format 2sp▾ Minify Sort │  menu   │ Format 2sp▾ Minify Sort  │
│ Repair Open Copy Down.  │ ☑Compare│ Repair Open Copy Down.   │
│ Schema  text|tree|table │         │ Schema  text|tree|table  │
│   left editor           │ Changes │   right editor           │
│                         │ ↑ ↓ 2/5 │                          │
│                         │ ⇄  → ←  │                          │
│                         │   ⋮⋮    │                          │
│ Valid JSON · 2 KB       │         │ Valid JSON · 2 KB        │
├──────────────────────────────────────────────────────────────┤
│ Changes drawer (closable, slides up from the bottom)   ( ⌘K )│ ← floating palette button
└──────────────────────────────────────────────────────────────┘
```

- **Sidebar:** single entry **JSON** **(user)**, route `/#/tools/json`. Old routes `/#/tools/json-editor` and `/#/tools/json-compare` are **not** redirected — they show the existing "Tool not found" page **(user: nothing has been released)**.
- **Each editor** keeps everything the JSON Editor has today: Format with indent choice, Minify, Sort keys, Repair, Open file / drag-drop, Copy, Download, Schema panel (per editor **(user)**), text / tree / table views, transform/query, status bar.
- **Middle menu**, top to bottom:
  - **Compare** checkbox (off by default — **builder's call**). **Not clickable while either side is empty or invalid** **(user)**; a tooltip/`aria-describedby` gives the reason (`Paste JSON on both sides to compare` or `Fix the JSON errors to compare`). If a side becomes empty or invalid while Compare is on, Compare turns off and its highlights clear; the user re-ticks it after fixing.
  - *(No "Ignore key order" checkbox: Compare always sorts keys A→Z, see §5.)*
  - **Changes (N)** button: opens the drawer; disabled when Compare is off or there are no changes.
  - **↑ / ↓** and **"Change 2 of 5"**: step through changes one by one with the focus outline **(user)**; hidden when Compare is off. Shortcuts **Ctrl+Alt+↓ / Ctrl+Alt+↑ on every OS** **(user)** — on macOS that is Control+Option (shown `⌃⌥↓`). See §3a for the override this causes.
  - **⇄ Swap**, **Copy left → right**, **Copy right → left** **(user)**.
  - **⋮⋮ drag handle** (see below).
- **Split / drag handle (user):** dragging the handle left or right resizes the two editors; dragging it near an edge snaps that editor closed, leaving the middle menu and the other editor. Starts at 50/50; double-click resets to 50/50. Snap when a pane would be under 15% of the width; minimum open width 240 px **(builder's call)**.
  - While one side is closed, Compare and its controls are disabled; the checkbox keeps its value and re-applies when the side reopens **(builder's call)**.
  - Keyboard: the handle is focusable (`role="separator"`, `aria-orientation="vertical"`, `aria-valuenow` as a percentage); ←/→ resize in 5% steps, Home/End close a side, Enter resets to 50/50 **(builder's call)**.
- **Narrow screens** (≤ 720 px): editors stack vertically, the middle menu becomes a horizontal bar between them, and the drag handle is hidden **(builder's call)**.
- **Changes drawer (user):** slides up from the bottom of the tool, closable (✕ and Escape); no resizable height. Lists changes exactly like the current Changes tab (kind, JSONPath, before → after; capped at 1,000 with a note). Clicking a row focuses that change: both editors scroll to it and show the focus outline, in whatever view each editor is in. Opening the drawer moves keyboard focus into it; closing returns focus to the Changes button.
- **Copy / Swap:** Copy replaces the target editor's content with the source's raw text; Swap exchanges the two; the target keeps its current view. No confirmation dialog; the replaced content is recoverable with the editor's undo where the library supports it **(builder's call)**.

## 3a. Command palette and keyboard shortcuts (user)

- **Floating button (user):** a round button (44 × 44 px, an easy touch target) fixed in the **bottom-right corner** of the app, 16 px from the edges (24 px on wide screens), with an inline-SVG command icon and a small key chip showing the shortcut that opens it — **`⌘K` on macOS, `Ctrl+K` on Windows and Linux** **(user)**. Tooltip: `Commands and shortcuts (⌘K)` / `(Ctrl+K)`. When the Changes drawer is open the button sits above it, never covering it or editor scrollbars **(builder's call)**. It is part of the app shell, so every tool gets it.
- **Opening (user):** ⌘K (macOS) / Ctrl+K (Windows, Linux), from anywhere — including while typing in an editor — or by clicking the button. The handler runs before the editor and the browser and calls `preventDefault()`, so the browser's own Ctrl+K (focus the search bar) and the editor do not also act **(builder's call)**.
- **The palette (builder's call on the details):** a modal dialog (`role="dialog"`, `aria-modal`, label `Command palette`) with a search box focused on open, and below it the commands, each with its shortcut shown as keys. ↑/↓ move, Enter runs the selected command, Escape closes and returns focus where it was. Typing filters by case-insensitive word match. Commands that cannot run right now (for example *Next change* while Compare is off) are shown dimmed with the reason and cannot be run.
  - **JSON tool commands:** Format left/right, Minify left/right, Sort keys left/right, Repair left/right, Toggle Compare, Next change, Previous change, Show changes, Swap sides, Copy left to right, Copy right to left, Reset split, Close left editor, Close right editor.
  - **App commands:** Toggle theme, and *Go to <tool>* for each registered tool.
  - **Keyboard reference** (read-only rows, not runnable): split-handle keys, Escape closes drawer/palette, and the editor's built-in keys (find, find & replace, undo, redo, select all, indent/outdent, fold/unfold) — taken from the library's actual key map, not guessed.
  - Toolbar and middle-menu buttons show the same shortcut in their tooltips.
- **OS-aware labels (user):** the OS is detected once (`navigator.userAgentData.platform`, falling back to `navigator.platform` / user agent). macOS shows symbols without separators (`⌘K`, `⌃⌥↓`, `⇧`, `⌥`); Windows and Linux show words joined with `+` (`Ctrl+K`, `Ctrl+Alt+↓`, `Shift`, `Alt`). Shortcuts are defined once in an OS-neutral form (`mod` = ⌘ on macOS, Ctrl elsewhere) and both the matcher and the labels use that definition.
- **Ctrl+Alt+↓/↑ override (user):** on Windows and Linux the editor uses Ctrl+Alt+↓/↑ for *add cursor below/above*. While Compare is on, our step-through takes these keys first, so add-cursor is not available by that shortcut in the editors; while Compare is off, the editor keeps its default **(builder's call: only override when the shortcut can do something)**. On Ubuntu/GNOME desktops the OS uses Ctrl+Alt+↑/↓ to switch workspaces before the browser sees them, so there the ↑/↓ buttons or the palette are the way to step. This is stated in the README's keyboard section and as a note in the palette's keyboard reference on Windows/Linux **(user)**.
- **Roadmap (user):** revisiting these conflicts is a roadmap item (see intent.md §9).

## 4. Comments — not supported in this version (user)

- `//` and `/* … */` comments make the document **invalid**, as today.
- **Clear message (user):** when parsing fails at a `/` that starts `//` or `/*`, the error reads **`Comments aren't supported yet. Click Repair to remove them.`**, with the line and column of the comment. This is safe to detect: the parser only stops at a `/` that is *outside* a string, so `"http://x"` is never mistaken for a comment. The message appears wherever parse errors appear: the status bar, the library's own error display in text mode (it uses our parser), the Schema panel, and the compare reason (Compare is disabled because the side is invalid).
- **Repair** removes comments (that is what `jsonrepair` does; verified to keep `"http://x"` intact) — the one-click fix the message points to.
- **Documentation (user):** README states that comments are not supported yet, that Repair removes them, and that comment support is planned.
- **Roadmap (user):** "JSON with comments" is added to intent.md §9 with the rules agreed in brainstorming, kept for that milestone: `//` to end of line; `/* … */` (incl. `/** */`), first `*/` ends it, no nesting; markers inside strings are text; ignored by validation and compare; removed by Format/Minify/Sort. Implementation choice (own scanner vs Microsoft's `jsonc-parser`) is made then; the key risk is comment markers inside strings.

## 5. Compare behaviour

- **Structural, not textual:** compare uses the existing lossless structural diff (`core/diff/structural.ts`: array items matched by `id`/`_id`/`uuid`, moves detected, big integers and long decimals exact, the custom bigint and number-literal filters). Highlights are placed on the JSON values each change refers to. Whitespace, formatting and key order never highlight.
- **Ticking Compare sorts both editors A→Z (user):** it runs *Sort keys* on both editors (nested objects too, arrays keep their order), using each editor's current indentation, so matching keys line up side by side. Unticking Compare leaves the text sorted. Key order never matters to compare, and the old "Ignore key order" option is gone.
  - Compare cannot be ticked while a side is empty or invalid, and turns off if one becomes so (user), so sorting only ever runs on valid JSON.
  - While Compare stays on, whole-document replacements are sorted automatically — paste over everything, Open file / drop, Copy left↔right, Swap, Repair, Format. Typing is **never** re-sorted mid-keystroke; an editor re-sorts **once when focus leaves it** (click-away / blur) **(user)**. Differences are computed order-insensitively throughout, so results stay correct while typing.
- **When it runs:** whenever Compare is on and either side changes (debounced as today, ~250 ms), in a Web Worker above 1,000,000 characters combined (existing threshold). Turning Compare off removes all highlights immediately.
- **States:** Identical data shows "No differences" (or "Same data — key order or number notation differs" when only number notation such as `1.0` vs `1` differs, as today).
- **Highlight meaning:**
  - removed (only in left): red tint on the left value;
  - added (only in right): green tint on the right value;
  - changed: **yellow "warning" tint on both sides** **(user)**. Tint: soft yellow (light ≈ `rgba(255,193,7,.22)`, dark ≈ `rgba(255,183,77,.20)`); side bar: the existing amber `--changed` token (light `#b26a00`, dark `#ffb74d`) so the bar keeps ≥ 3:1 contrast. Text on the tint stays ≥ 4.5:1 in both themes;
  - moved (array item): the "moved" color on the item in both editors.
  Every highlighted line/node also gets a left bar so meaning is not carried by color alone; the Changes drawer states the kind in words.
- **Text view:** highlight the full lines spanned by each changed value (from its key to the end of its value).
- **Tree / table views:** highlight the changed node/cell; ancestors of a changed node get a subtle marker so collapsed nodes still reveal that something inside changed **(builder's call)**.
- **Focus / step-through:** ↑/↓ (or Ctrl+Alt+↓/↑) walk the change list in drawer order; the focused change gets the accent outline and a short pulse in both editors (the behaviour shipped for the old Text diff tab: stops at the ends, re-pulses when pressed at an end, counter "Change k of N", no animation under `prefers-reduced-motion`).
- **What Compare compares:** always each editor's *text*. `<JsonEditorView>` re-serializes tree/table edits to text and emits only text, so tree/table edits trigger a re-compare like typing does.
- **Highlights at scale:** text-view highlights are CodeMirror decorations (only visible lines render); tree/table highlights use the library's per-node `onClassName`. At most the first **10,000** changes are highlighted; beyond that the middle menu shows "Highlighting the first 10,000 of N changes" and the drawer keeps its 1,000-row cap. The "compare two 5 MB docs < 3 s" budget covers the diff **and** the first paint of highlights.

## 6. What happens to existing pieces

- `tools/json-editor` and `tools/json-compare` are replaced by `tools/json` **(user)**. Their pure logic (`applyEdit`, `computeStatus`, `compareJson`, `summaryText`, `lineOfPath`, …) is reused, moved or merged — **builder's call**.
- The old **Text diff tab** is not part of the new tool. **`core/diff/TextDiffView.tsx`, its CSS and `core/diff/focus.ts` stay in `core/`** for the v1.1 Text tools' text diff **(user: pure text compare is a future Text feature)**.
- **Existing tests for the removed tools** are ported, then removed, as decided in §10.
- Registry smoke, no-egress and container CSP tests pick up the new tool through the registry and `exercise.ts`.
- intent.md §9 roadmap: the command palette moves from v1.1 into this work; "JSON with comments" and "keyboard-shortcut conflicts" are added.

## 7. Constraints (unchanged from intent.md unless stated)

- Offline, no egress, strict CSP without `unsafe-eval`; only `core/json-view/` may import `vanilla-jsoneditor`; relative imports; architecture tests stay green. The palette lives in the shell (`src/app/`); tools register commands through `src/core/commands/`, so no tool imports `app/`.
- Lossless numbers, BOM handling, binary-file rejection, clipboard fallback — all still apply per editor.
- Budgets: entry ≤ 150 KB gzip (the palette is in the entry chunk, so it uses no new dependency); the JSON route ≤ 600 KB gzip; open 20 MB in text mode < 3 s; compare two 5 MB docs < 3 s.
- Protected tests: no existing test is modified, weakened, skipped or deleted without the user's explicit confirmation (see §10).

## 8. UI / accessibility standards

- All colors come from the app's theme tokens (`src/app/styles.css`), with light and dark values; no hard-coded colors in components.
- Text contrast ≥ 4.5:1 (WCAG 2.2 AA) in both themes, including text on highlighted lines/nodes; non-text UI (highlight bars, focus outline, drag handle, floating button) ≥ 3:1.
- Differences are never shown by color alone (bars + drawer wording).
- Everything is keyboard-operable: toolbar, middle menu, drag handle, drawer, palette (Escape closes, focus returns). Visible focus indicators.
- `prefers-reduced-motion` disables the pulse, smooth scrolling, the drawer slide and the palette's open animation.
- Done means: screenshots of the tool in light and dark theme, Compare on and the palette open, with both the macOS and the Windows label set, reviewed before the work is called complete.

## 9. Risks the builder should de-risk early

| Risk | Why | Suggested de-risking |
|---|---|---|
| Highlighting inside `vanilla-jsoneditor`'s **text** mode | The library exposes `onClassName(path, value)` for tree/table only; text mode is its internal CodeMirror | Spike first: decorations via `EditorView.findFromDOM` + `StateEffect.appendConfig`. Decide before building the rest (see §10 gate). |
| Jumping to a change in tree/table | Needs the library's `scrollTo(path)` | Available in v3 (`scrollTo`, `findElement`); verify in the spike. |
| Our shortcuts reaching us before the editor | ⌘K/Ctrl+K and Ctrl+Alt+↓/↑ are pressed while focus is inside the library's CodeMirror | Verify in the spike: a window-level capture-phase `keydown` listener sees them first, and `preventDefault()` + `stopPropagation()` stop CodeMirror's add-cursor and the browser's search shortcut. |
| Two full editors + compare in one route; palette in the entry | Bundle budgets | Measure early with `npm run check:bundle`. |

## 10. Decisions on tests and on the spike (user, 2026-11-08)

**Existing tests — "port, then remove" (user):** the old tools and all their tests stay registered and green until the new JSON tool passes ported versions of every existing assertion. A final task then removes the old tools, their old specs and their budget lines in one change. The user approved, in advance, changing or removing these protected files for that purpose, and only that purpose:
`e2e/json-editor.spec.ts`, `e2e/json-compare.spec.ts`, the 5 MB compare test in `e2e/perf.spec.ts`, `e2e/container/headers.spec.ts`, `e2e/support/exercise.ts`, `src/tools/registry.test.ts`, `src/tools/json-editor/logic.test.ts`, `src/tools/json-compare/logic.test.ts`, and the per-tool route budgets in `scripts/check-bundle.mjs`.
Every assertion keeps its meaning when ported (same behaviour, new route/selectors). The PR lists each ported and each removed test.
**Removed with the "Ignore key order" option (user approved):** (1) in `e2e/json-compare.spec.ts`, the step that unticks "Ignore key order" and expects the key-order message (the rest of that test is ported); (2) in `src/tools/json-compare/logic.test.ts`, the case calling `compare(…, false)` with reordered keys and the case "normalizes both sides… sorted when ignoring key order". The number-notation (`1.0` vs `1`) and sorted-normalization assertions are ported. A new test covers "ticking Compare sorts both editors A→Z". Any other existing test still needs a per-case yes.
**The old focus tests** ("highlights the focused change in the text diff…", "jumping from the Changes tab focuses that change in the text diff") are ported to the same behaviour in the new tool's editors; `TextDiffView` itself stays in `core/` without a UI until v1.1.

**Text-view highlighting spike (user):** the spike comes first. If highlighting inside the library's text view cannot be done cleanly (no forking/patching the library, no CSP change), work **stops and the user is asked**, with what the spike found and the options. Nothing is built on a fallback without that decision.
