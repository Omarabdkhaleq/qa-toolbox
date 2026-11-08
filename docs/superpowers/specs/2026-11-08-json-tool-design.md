# JSON tool — design

> Status: **approved** (2026-11-08). Supersedes intent.md §4.1 (JSON Editor) and §4.2 (JSON Compare); everything else in `intent.md` (privacy, offline, CSP, budgets, testing, delivery) still applies.
> Decisions marked **(user)** were made by the product owner; **(builder's call)** were made while writing this and can be revisited.

## 1. Intent

Today qa-toolbox has two separate tools: **JSON Editor** (one editor with format/repair/schema) and **JSON Compare** (two plain panes plus a separate result area). Working with two payloads means switching tools and pasting twice, and the compare result lives in a third view instead of where the user typed.

The new **JSON** tool puts two full editors side by side, the way jsoneditoronline.org does: each side can be formatted, repaired, validated and viewed as text / tree / table on its own, and ticking **Compare** highlights the differences *in place*, in the same editors the user pasted into. A **Changes** drawer lists the differences, and a draggable divider resizes the editors or closes one entirely.

It also accepts **comments** in JSON (`// …` and `/* … */`), which are common in config files and API examples, and ignores them everywhere meaning is computed.

### Success looks like
1. One sidebar entry, **JSON** **(user)**, replaces JSON Editor and JSON Compare.
2. Paste two payloads, tick **Compare**, and see differences highlighted in both editors in text, tree and table views **(user)**.
3. JSON with Java-style comments is valid, formats cleanly (comments removed) and compares as if the comments were not there **(user)**.
4. All existing guarantees still hold: no network egress, strict CSP, lossless big numbers, BOM/binary handling, budgets.

## 2. Goals, non-goals, anti-goals

**Goals**
- Two equal, independent editors with the full JSON Editor toolbar each.
- In-place, structural compare across text, tree and table views, toggled by a checkbox.
- Changes drawer, step-through navigation, resizable/collapsible split.
- Comment support following Java comment rules.
- Readable in light and dark themes (WCAG AA).

**Non-goals (this version)**
- Preserving comments through Format / Minify / Sort keys / tree editing — they are stripped **(user)**.
- Other JSON5/JSONC features (unquoted keys, single quotes, trailing commas as *valid* JSON). Repair still fixes those on request, as today.
- Nested block comments (Java does not nest them).
- Remembering split position, closed side or contents across reloads (persistence is roadmap v1.4) **(user, default 10)**.
- A line-by-line *text* diff of raw text (the old "Text diff" tab). See §6.

**Anti-goals — failure even if it technically works**
- Comments, whitespace, formatting or key order showing up as differences.
- Highlights or text that are hard to read in either theme, or differences conveyed by color alone.
- Any data leaving the browser, or a CSP relaxation (`unsafe-eval`) to make this work.
- Big integers rounded or `__proto__` keys lost anywhere in the new flow.

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
│ Valid JSON · 1 comment  │         │ Valid JSON · 0 comments  │
├──────────────────────────────────────────────────────────────┤
│ Changes drawer (closable, slides up from the bottom)         │
└──────────────────────────────────────────────────────────────┘
```

- **Sidebar:** single entry **JSON** **(user)**, route `/#/tools/json`. Old routes `/#/tools/json-editor` and `/#/tools/json-compare` are **not** redirected — they show the existing "Tool not found" page **(user: nothing has been released, so no old links exist)**.
- **Each editor** keeps everything the JSON Editor has today: Format with indent choice, Minify, Sort keys, Repair, Open file / drag-drop, Copy, Download, Schema panel (per editor **(user, default 9)**), text / tree / table views, transform/query, status bar. The status bar adds a comment count (for example "Valid JSON · 2 comments ignored").
- **Middle menu**, top to bottom:
  - **Compare** checkbox (off by default — **builder's call**). **Not clickable while either side is empty** (including a side that holds only comments) **(user)**; a tooltip/`aria-describedby` says `Paste JSON on both sides to compare`. If a side becomes empty while Compare is on, Compare turns off and its highlights clear.
  - *(No "Ignore key order" checkbox: Compare always sorts keys A→Z, see §5.)*
  - **Changes (N)** button: opens the drawer; disabled when Compare is off or there are no changes.
  - **↑ / ↓** and **"Change 2 of 5"**: step through changes one by one with the focus outline **(user, default 4)**; hidden when Compare is off.
  - **⇄ Swap**, **Copy left → right**, **Copy right → left** **(user, default 2)**.
  - **⋮⋮ drag handle** (see below).
- **Split / drag handle (user):** dragging the handle left or right resizes the two editors; dragging it near an edge snaps that editor closed, leaving the middle menu and the other editor. Starts at 50/50; double-click resets to 50/50 **(user, default 6)**. Snap threshold and minimum pane width: **builder's call** (suggested: snap when a pane would be under ~15% of the width; minimum open width ~240 px).
  - While one side is closed, Compare and its controls are disabled (there is nothing to compare); the checkbox keeps its value and re-applies when the side reopens **(builder's call)**.
  - Keyboard: the handle is focusable (`role="separator"`, `aria-orientation="vertical"`, `aria-valuenow` as a percentage); ←/→ resize in steps, Home/End close a side, Enter resets to 50/50 **(builder's call)**.
- **Narrow screens** (≤ 720 px): editors stack vertically, the middle menu becomes a horizontal bar between them, and the drag handle is hidden **(builder's call)**.
- **Changes drawer (user, default 3):** slides up from the bottom of the tool, closable (✕ and Escape); a resizable height is **not** required. Lists changes exactly like the current Changes tab (kind, JSONPath, before → after; capped at 1,000 with a note). Clicking a row focuses that change: both editors scroll to it and show the focus outline, in whatever view each editor is in. Opening the drawer moves keyboard focus into it; closing returns focus to the Changes button.
- **Copy / Swap:** Copy replaces the target editor's content; Swap exchanges the two. No confirmation dialog; the replaced content is recoverable with the editor's undo if the library supports it in that view **(builder's call)**.

## 4. Comments

**(user)** Java comment rules:
- `//` starts a comment that runs to the end of the line.
- `/*` starts a block comment that ends at the first `*/`; `/** … */` is the same. Block comments do **not** nest.
- Comment markers inside JSON strings are ordinary text (`"http://x"` is a string, not a comment). Escapes inside strings (`"a\"//b"`) are respected.
- An unterminated `/*` is a parse error reported at the comment's start ("Unterminated comment").

**Where comments are ignored (user):** validation and status, Format, Minify, Sort keys, Compare (they never count as differences), schema validation of the document, and the Changes drawer. Format / Minify / Sort keys output has **no comments** **(user)**.

**Positions stay correct (builder's call):** comments are removed by replacing their characters with spaces (keeping line breaks), so parse-error line/column numbers and jump-to-change positions still point at the user's actual text.

**Also accepted in (builder's call):** the Schema panel text, and files opened from disk.

**Tree / table views (user, default 7):** these views cannot show comments, so switching an editor that contains comments from text to tree/table drops them. The first time this would happen in a session, a dismissible notice says comments will be removed; switching back to text does not restore them.

**Documentation (user):** README and `intent.md` state clearly that comments are allowed, are ignored by validation and compare, and are removed by Format / Minify / Sort keys and by tree/table views.

## 5. Compare behaviour

- **Structural, not textual (builder's call, follows from the anti-goals):** compare uses the existing lossless structural diff (`core/diff/structural.ts`: array items matched by `id`/`_id`/`uuid`, moves detected, big integers and long decimals exact, the custom bigint and number-literal filters). Highlights are placed on the JSON values each change refers to. Therefore whitespace, formatting, comments and key order never highlight.
- **Ticking Compare sorts both editors A→Z (user):** it runs *Sort keys* on both editors (nested objects too, arrays keep their order), using each editor's current indentation, so matching keys line up side by side. Like the Sort keys button this re-indents and removes comments; if either side has comments, the one-time comments notice (§4) appears first. Unticking Compare leaves the text sorted. Key order therefore never matters to compare, and the old "Ignore key order" option is gone.
  - Compare cannot be ticked while a side is empty (user). A side that is **invalid** when Compare is ticked is left exactly as typed; it is sorted the first time its whole content is replaced while Compare is on (builder's call).
  - While Compare stays on, whole-document replacements are sorted automatically — paste over everything, Open file / drop, Copy left↔right, Swap, Repair, Format. Ordinary typing is **not** re-sorted on every keystroke (it would move the cursor); differences are still computed order-insensitively, so results stay correct (builder's call).
- **When it runs:** whenever Compare is on and either side changes (debounced as today, ~250 ms), in a Web Worker above 1,000,000 characters combined (existing threshold). Turning Compare off removes all highlights immediately.
- **States:** if a side is empty or invalid, no highlights; the middle menu shows the same messages as today ("Paste JSON on both sides to compare", "Fix the JSON errors to compare"). Identical data shows "No differences" (or "Same data — key order or number notation differs" when only number notation such as `1.0` vs `1` differs, as today).
- **Highlight meaning (user for "changed"; the rest builder's call, matching existing colors):**
  - removed (only in left): red tint on the left value;
  - added (only in right): green tint on the right value;
  - changed: **yellow "warning" tint on both sides** **(user)**. Tint: soft yellow (light theme ≈ `rgba(255,193,7,.22)`, dark ≈ `rgba(255,183,77,.20)`); side bar: the existing amber `--changed` token (light `#b26a00`, dark `#ffb74d`) so the bar keeps ≥ 3:1 contrast against the background. Text on the tint must stay ≥ 4.5:1 in both themes;
  - moved (array item): the "moved" color on the item in both editors.
  Every highlighted line/node also gets a left bar so meaning is not carried by color alone; the Changes drawer states the kind in words.
- **Text view:** highlight the full lines spanned by each changed value (from its key to the end of its value).
- **Tree / table views:** highlight the changed node/cell; ancestors of a changed node get a subtle marker so collapsed nodes still reveal that something inside changed **(builder's call)**.
- **Focus / step-through:** ↑/↓ walk the change list in drawer order; the focused change gets the accent outline and a short pulse in both editors (the behaviour shipped for the old Text diff tab: stops at the ends, re-pulses when pressed at an end, counter "Change k of N", no animation under `prefers-reduced-motion`).

## 6. What happens to existing pieces

- `tools/json-editor` and `tools/json-compare` are replaced by `tools/json` **(user, default 1)**. Their pure logic (`applyEdit`, `computeStatus`, `compareJson`, `summaryText`, `lineOfPath`, …) is reused, moved or merged — **builder's call**.
- The old **Text diff tab** (CodeMirror MergeView of normalized texts) is not part of the new tool: compare now happens inside the user's editors. `TextDiffView` and its focus code may be deleted or reused — **builder's call**; the focus *behaviour* in §5 must be preserved.
- **Existing tests for the removed tools** (`e2e/json-editor.spec.ts`, `e2e/json-compare.spec.ts`, their `exercise.ts` entries, and logic tests if logic moves) — ported, then removed, as decided in §10.
- Registry smoke, no-egress and container CSP tests pick up the new tool automatically through the registry and `exercise.ts`.

## 7. Constraints (unchanged from intent.md unless stated)

- Offline, no egress, strict CSP without `unsafe-eval`; only `core/json-view/` may import `vanilla-jsoneditor`; relative imports; architecture tests stay green.
- Lossless numbers, BOM handling, binary-file rejection, clipboard fallback — all still apply per editor.
- Budgets: entry ≤ 150 KB gzip; the JSON route ≤ 600 KB gzip (one route now instead of two); open 20 MB in text mode < 3 s; compare two 5 MB docs < 3 s.
- Protected tests: no existing test is modified, weakened, skipped or deleted without the user's explicit confirmation (see §10).

## 8. UI / accessibility standards

- All colors come from the app's theme tokens (`src/app/styles.css`), with light and dark values; no hard-coded colors in components.
- Text contrast ≥ 4.5:1 (WCAG 2.2 AA) in both themes, including text on highlighted lines/nodes; non-text UI (highlight bars, focus outline, drag handle) ≥ 3:1.
- Differences are never shown by color alone (bars + drawer wording).
- Everything is keyboard-operable: toolbar, middle menu, drag handle, drawer (Escape closes, focus returns). Visible focus indicators.
- `prefers-reduced-motion` disables the pulse, smooth scrolling and the drawer slide.
- Done means: screenshots of the tool in light and dark theme, compare on, reviewed before the work is called complete.

## 9. Risks the builder should de-risk early

| Risk | Why | Suggested de-risking |
|---|---|---|
| Highlighting inside `vanilla-jsoneditor`'s **text** mode | The library exposes `onClassName(path, value)` for tree/table only; text mode is its internal CodeMirror | Spike first: add decorations to its CodeMirror via `EditorView.findFromDOM` + `StateEffect.appendConfig` (already rely on `findFromDOM` for `getText`). Fallback: render text mode with our own `CodeEditor` and use the library only for tree/table. Decide before building the rest. |
| Comments vs the library's own parsing | The editor parses text with our `losslessJsonParser` | The comment-stripping must happen inside the parser the editor uses, so validation in all modes ignores comments. |
| Jumping to a change in tree/table | Needs the library's `scrollTo(path)` | Available in v3 (`scrollTo`, `findElement`); verify in the spike. |
| Two full editors + compare in one route | Bundle budget 600 KB gzip per route | Measure early with `npm run check:bundle`. |

## 9a. Further decisions (builder's calls, from the design review)

- **What Compare compares:** always each editor's *text*. `<JsonEditorView>` already re-serializes tree/table edits to text and emits only text, so tree/table edits trigger a re-compare like typing does, and highlight positions are computed against that text.
- **Copy left→right / right→left and Swap** move the **raw text**, comments included. The target editor keeps its current view. If the target is in tree/table view and the incoming text has comments, the comments-removed notice (§4) applies there.
- **Highlights at scale:** text-view highlights are CodeMirror decorations (only visible lines are rendered); tree/table highlights use the library's per-node `onClassName`. Highlights are drawn for at most the first **10,000** changes; beyond that, the middle menu shows "Highlighting the first 10,000 of N changes" and the drawer keeps its 1,000-row cap. The "compare two 5 MB docs < 3 s" budget covers the diff **and** the first paint of highlights.
- **Repair** strips comments (that is what `jsonrepair` does). The status comment count ignores `//` and `/*` that appear inside strings.

## 10. Decisions on tests and on the spike (user, 2026-11-08)

**Existing tests — "port, then remove" (user):** the old tools and all their tests stay registered and green until the new JSON tool passes ported versions of every existing assertion. A final task then removes the old tools, their old specs and their budget lines in one change. The user approved, in advance, changing or removing these protected files for that purpose, and only that purpose:
`e2e/json-editor.spec.ts`, `e2e/json-compare.spec.ts`, the 5 MB compare test in `e2e/perf.spec.ts`, `e2e/container/headers.spec.ts`, `e2e/support/exercise.ts`, `src/tools/registry.test.ts`, `src/tools/json-editor/logic.test.ts`, `src/tools/json-compare/logic.test.ts`, and the per-tool route budgets in `scripts/check-bundle.mjs`.
Every assertion keeps its meaning when ported (same behaviour, new route/selectors). The PR lists each ported and each removed test.
**Removed with the "Ignore key order" option (user approved, 2026-11-08):** (1) in `e2e/json-compare.spec.ts`, the step that unticks "Ignore key order" and expects the key-order message (the rest of that test is ported); (2) in `src/tools/json-compare/logic.test.ts`, the case calling `compare(…, false)` with reordered keys and the case "normalizes both sides… sorted when ignoring key order". The number-notation (`1.0` vs `1`) and sorted-normalization assertions are ported. A new test covers "ticking Compare sorts both editors A→Z". The `ignoreKeyOrder` option and its checkbox are deleted from the code; `sortKeysDeep` and the structural diff's key-order insensitivity stay. Any other existing test still needs a per-case yes.

**Text-view highlighting spike (user):** the spike in §9 comes first. If highlighting inside the library's text view cannot be done cleanly (no forking/patching the library, no CSP change), work **stops and the user is asked**, with what the spike found and the options. Nothing is built on a fallback without that decision.
