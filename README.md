# qa-toolbox

A private, offline toolbox for developers and QA engineers. Everything runs in your browser — pasted data never leaves your machine, not even to the container serving the app.

**v1 tool:** JSON — two editors side by side (text / tree / table, format, minify, sort keys, repair, JSONQuery / JMESPath / JSONPath, JSON Schema validation) with in-place compare.

## Run it

```bash
docker run --rm -p 47321:8080 ghcr.io/<owner>/qa-toolbox
```

Open http://localhost:47321. Works on amd64 and arm64 (Apple Silicon).

Hardened mode (read-only filesystem):

```bash
docker run --rm -p 47321:8080 --read-only --tmpfs /tmp ghcr.io/<owner>/qa-toolbox
```

Live demo: `https://<owner>.github.io/qa-toolbox/` (same build; CSP via `<meta>`, so `frame-ancestors` is not enforced there).

## JSON

One tool, at `/#/tools/json`, with two editors side by side (stacked on narrow screens) and a resizable split.

- Each side has text, tree and table views, Format, Minify, Sort keys, Repair, queries (JSONQuery / JMESPath / JSONPath) and JSON Schema validation.
- Tick **Compare** to highlight differences in place (removed, added, changed, moved) and open the **Changes** drawer to list and jump between them. Ticking Compare sorts keys on both sides; an editor re-sorts when it loses focus, never while you type.
- While you type, invalid JSON only pauses Compare (it stays ticked and resumes when the JSON is valid again); Compare turns off only if the side is still empty or invalid when you leave that editor.
- Table view shows no highlights; a note says differences are highlighted in text and tree views. Scrolling to a change still works.
- Comments (`//`, `/* */`) aren't supported yet. Repair removes them; support is planned.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Open the command palette | ⌘K | Ctrl+K |
| Next / previous change (Compare on) | ⌃⌥↓ / ⌃⌥↑ | Ctrl+Alt+↓ / Ctrl+Alt+↑ |

- On Windows/Linux, Ctrl+Alt+↓/↑ **overrides the editor's add-cursor below/above while Compare is on**.
- On Ubuntu desktops the system takes these keys first; use the Changes buttons or the command palette instead.

## Privacy guarantees (enforced in CI)

- No outbound requests: `e2e/no-egress.spec.ts` uses every tool and fails on any request outside the app's origin.
- Strict CSP without `unsafe-eval`: `e2e/container/headers.spec.ts` checks headers and fails on any CSP violation.
- No telemetry, analytics, CDN assets, or remote fonts.

## Develop

```bash
npm ci
npm run dev            # http://localhost:5173
npm run verify         # lint, format, typecheck, unit tests + coverage, build, bundle budgets
npm run e2e            # Playwright on Chromium, Firefox, WebKit
npm run e2e:perf       # performance budgets
docker compose up --build -d && BASE_URL=http://localhost:47321 npm run e2e:container
```

## Architecture

See [intent.md](./intent.md). In short: a React shell renders tools from `src/tools/registry.ts`; shared building blocks live in `src/core/`; `src/architecture/` tests enforce the import rules.

## Adding a tool

1. Create `src/tools/<id>/` with:
   - `index.ts` exporting a `ToolDefinition` (`id`, `name`, `category`, `description`, `keywords`, `load: () => import('./<Name>Tool')`). Keep it free of other imports.
   - `<Name>Tool.tsx` — default-exported component. Don't render an `<h1>`; the shell does.
   - `logic.ts` — pure functions (no React), with `logic.test.ts` written first.
2. Add it to the array in `src/tools/registry.ts`.
3. Optional: add an entry to `e2e/support/exercise.ts` so the privacy and CSP checks use it for real, and a budget line in `scripts/check-bundle.mjs`.

The registry smoke test, no-egress test, and CSP test pick the new tool up automatically.

## Release

Push a tag `vX.Y.Z`. CI publishes `ghcr.io/<owner>/qa-toolbox:{X.Y.Z,latest}` (amd64 + arm64), deploys the Pages demo, and creates a GitHub Release with generated notes.
