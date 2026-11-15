# 0002 — Highlighting differences inside vanilla-jsoneditor views

- Date: 2026-11-09
- Status: Accepted (2026-11-09). User decision on the table-mode failure: no highlights in table view; show the note "Differences are highlighted in text and tree views" while Compare is on; scroll-to-change still works there.

## Context
The merged JSON tool (spec §9) highlights differences inside the user's own editors instead of in a separate diff view. That needs, without forking or patching vanilla-jsoneditor 3.13.0: (a) line decorations in text mode, (b) colored nodes and scroll-to-path in tree and table modes, (c) global shortcuts that win against the editor's own bindings, all under the strict CSP.

## Spike
Throwaway branch `spike/text-highlights` (deleted), a scratch change in `JsonEditorView`:
- Text mode: a `MutationObserver` on the host sees each new `.cm-editor`, gets its view with `EditorView.findFromDOM`, and dispatches `StateEffect.appendConfig.of(field)`. The field is a `StateField<DecorationSet>` of `Decoration.line({ class: 'spike-hl' })`, rebuilt on doc changes, on lines containing `"name"`.
- Tree/table: `onClassName` returning `'spike-hl'` for the `name` node, plus the editor's `scrollTo(path)`.
- Shortcuts: `window.addEventListener('keydown', h, { capture: true })` that records and `preventDefault()`s Ctrl/Cmd+K and Ctrl+Alt+ArrowDown.
- Driven by a throwaway Playwright script in chromium, firefox and webkit.

Deviation from the brief: Docker Desktop's daemon was unresponsive for the whole session (`docker ps` and `docker compose up --build -d` hung for 30+ minutes, and port 47321 answered 404/500 from a stale nginx). The checks ran instead against the Pages build (`QA_TOOLBOX_TARGET=pages vite build`, which carries the same CSP as a `<meta>` tag, minus `frame-ancestors`) served by a static file server. The nginx container run was not done; re-confirm against the container when Task 10 runs `e2e:container`.

| Check | chromium | firefox | webkit |
|---|---|---|---|
| Text mode: `.spike-hl` on the `"name"` line after load | PASS | PASS | PASS |
| Text mode: still on that line after typing | PASS | PASS | PASS |
| Text mode: re-applied after text -> tree -> text | PASS | PASS | PASS |
| Tree mode: `onClassName` colors the node | PASS | PASS | PASS |
| Tree mode: `scrollTo(['zzfar'])` brings a far node into view | PASS | PASS | PASS |
| Table mode: `onClassName` colors the cell | **FAIL** | **FAIL** | **FAIL** |
| Table mode: `scrollTo(['150','v'])` brings a far row into view | PASS | PASS | PASS |
| Ctrl+Alt+Down: capture listener fired, `.cm-cursor` count stays 1 | PASS | PASS | PASS |
| Ctrl+K / Cmd+K: listener fired, document unchanged | PASS | PASS | PASS |
| Zero `securitypolicyviolation` events | PASS | PASS | PASS |

Table-mode failure, precisely: in 3.13.0 the `onClassName` callback is never invoked while the editor is in table mode. Probed with a logging callback: tree mode called it for every path (`["0","name"]`, `["0"]`, `[]`, ...), table mode called it zero times, with the callback set at creation and again via `updateProps`, and with array-of-objects content. No `.spike-hl` element exists in table mode. No alternative was tried, as agreed.

Caveats: headless browsers cannot show the browser's own Ctrl+K/Cmd+K behavior (location bar search), so only the `preventDefault` call and the unchanged document were checked. Cmd+Alt+Down (the mac form of add-cursor-below) was not exercised. The spike did not call `stopPropagation`; the production handler should use `stopImmediatePropagation` for any key CodeMirror also binds (macOS binds Ctrl-k to delete-to-line-end).

## Key map (text mode)
Read from the installed `vanilla-jsoneditor` bundle (it composes `defaultKeymap`, `searchKeymap`, `foldKeymap`, `indentWithTab`, `closeBracketsKeymap`, `completionKeymap`, `lintKeymap`, and its own history bindings) and `@codemirror/{commands,search,language}/dist/index.js`. `Mod` is Cmd on macOS and Ctrl elsewhere. From source, not exercised at runtime except Ctrl+Alt+Down.

| Action | Binding | Uses Mod |
|---|---|---|
| Find (panel also has the replace field; there is no separate replace shortcut) | `Mod-f` | yes |
| Find next / previous | `Mod-g` / `Shift-Mod-g`, `F3` / `Shift-F3` | yes (`F3` no) |
| Undo | `Mod-z` | yes |
| Redo | `Mod-y`; mac also `Mod-Shift-z`; all platforms `Ctrl-Shift-z` | yes |
| Select all | `Mod-a` | yes |
| Indent more / less | `Tab` / `Shift-Tab`, `Mod-]` / `Mod-[` | `Tab` no; brackets yes |
| Indent selection | `Mod-Alt-\` | yes |
| Fold / unfold | `Ctrl-Shift-[` / `Ctrl-Shift-]` (mac `Cmd-Alt-[` / `Cmd-Alt-]`) | mac only |
| Fold all / unfold all | `Ctrl-Alt-[` / `Ctrl-Alt-]` | no |
| Select parent syntax (library) | `Mod-i` | yes |
| Add cursor above / below | `Mod-Alt-ArrowUp` / `Mod-Alt-ArrowDown` | yes |
| Select next occurrence | `Mod-d` | yes |
| Go to line | `Mod-Alt-g` | yes |
| Delete to line end (mac only) | `Ctrl-k` | no |

Ctrl/Cmd+K and Ctrl+Alt+Down overlap CodeMirror bindings (Ctrl+Alt+Down is add-cursor-below on Windows/Linux; Ctrl-k is delete-to-line-end on macOS), so both need the capture-phase handler.

## Decision
- Text mode: approved. Line decorations through `findFromDOM` + `appendConfig` work in all three browsers under the CSP, but the decoration field must be re-attached whenever a new `.cm-editor` appears (a mode switch recreates the view). Use an observer or the mode-change callback.
- Tree mode: approved (`onClassName` + `scrollTo`).
- Table mode: not approved. `onClassName` is ignored there, so highlights cannot be shown by that route. The user must choose: omit highlights in table mode, highlight another way (for example a DOM overlay), or limit highlighting to text and tree. `scrollTo` works in table mode.
- Shortcuts: a window capture-phase `keydown` handler receives both chords before the editor, and `preventDefault()` stops add-cursor and any inserted text. Use `stopImmediatePropagation` for keys CodeMirror also binds.
