# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

qa-toolbox is a private, offline browser toolbox for developers and QA (React 19 + TypeScript ~6.0 + Vite 8), shipped as an unprivileged nginx Docker image. All processing happens in the browser; the container only serves static files. Design and rationale: `intent.md`; the build plan it was implemented from: `plan.md`; newer feature designs: `docs/superpowers/specs/`; decision records: `docs/decisions/`.

## Commands

```bash
npm run dev               # Vite dev server
npm run verify            # lint + format:check + typecheck + unit tests w/ coverage + build + bundle budgets (what CI's verify job runs)
npm test                  # Vitest once (jsdom)
npx vitest run src/core/formats/json.test.ts      # single test file
npx vitest run -t "rejects duplicate keys"        # single test by name
npm run e2e               # Playwright on chromium, firefox, webkit (builds + serves `vite preview` on :4173 itself)
npx playwright test e2e/json.spec.ts --project=chromium   # one spec, one browser
npm run e2e:perf          # performance budgets (CI uses PERF_MARGIN=2)
npm run check:bundle      # after `npm run build`: per-route gzip budgets + single-copy CodeMirror check

# Container (compose publishes host port 47321 -> container 8080)
docker compose up --build -d
BASE_URL=http://localhost:47321 npm run e2e:container   # headers, CSP-violation and transform checks; skipped without BASE_URL
docker compose down
```

Node 24 (`.nvmrc`). TypeScript is pinned to ~6.0 because typescript-eslint doesn't support 7.

## Architecture

- **Shell + registry.** `src/app/` renders a sidebar and hash routes (`/#/tools/<id>`) from `src/tools/registry.ts`. Each tool is a folder exporting a `ToolDefinition` whose `load()` lazy-imports `<Name>Tool.tsx`; the shell renders the tool's `<h1>`, so tools must not. A new tool = one folder + one line in the registry. The only tool today is `json` (`src/tools/json/`, route `/#/tools/json`), which replaced the old JSON Editor and JSON Compare. `ToolHost` wraps each tool in an error boundary and clears the lazy cache on "Reload tool".
- **`src/core/`** holds everything shared: `formats/` (FormatAdapter + lossless JSON adapter), `editor/` (`CodeEditor`, CodeMirror 6), `json-view/` (`JsonEditorView` wrapping vanilla-jsoneditor, eval-free query languages, cfworker schema validator), `diff/` (structural diff, JSON paths, merge view, change list, focus/step-through; `TextDiffView` and `focus.ts` are kept for a future Text tool), `commands/` (command palette registry, OS-aware shortcut labels), `worker/` (`runInWorker`/`exposeWorker`), `io/`, `react/`, `theme/`, `ui/`.
- **Pure logic lives in each tool's `logic.ts`** (no React/DOM); that's where unit tests and coverage focus (≥ 90 % lines on `src/core/**/*.ts` and `src/tools/*/logic.ts`).
- **Import rules are enforced by tests** in `src/architecture/` (not ESLint): `core/` never imports `tools/` or `app/`; a tool never imports another tool (`src/tools/types.ts` is the shared exemption); only `src/core/json-view/` may import `vanilla-jsoneditor`; `logic.ts` never imports `react`, `react-dom` or `@codemirror/view`. Use relative imports only — no path aliases — or the architecture test can't resolve them.
- **Numbers are lossless end to end.** Parsing uses `lossless-json` (`LosslessNumber`); `toPlainValue` turns them into `number`/`bigint`/string, and the JSON tool's compare wraps unsafe decimals in `NumberLiteral`. `structural.ts` registers custom jsondiffpatch filters for bigint and NumberLiteral because jsondiffpatch's trivial filter ignores them. Duplicate keys with different values are parse errors.
- **Large inputs (> 1,000,000 chars) go to Web Workers** (`WORKER_THRESHOLD_CHARS`), via `*.worker.ts` files that call `exposeWorker`.
- **vanilla-jsoneditor debounces `onChange`**, so toolbar actions read live text through `JsonEditorView`'s ref `getText()` (reads the CodeMirror doc in text mode), not React state.

## Privacy, CSP and budgets (enforced in CI)

- No runtime network access: no CDN assets, remote fonts, analytics or telemetry. `e2e/no-egress.spec.ts` exercises every tool (via `e2e/support/exercise.ts`) and fails on any non-origin request.
- Strict CSP without `unsafe-eval`. Never add `eval`/`new Function`, the JavaScript or Lodash query languages, or Ajv (ADR 0001 chose `@cfworker/json-schema`). The CSP lives in **both** `docker/security-headers.conf` (nginx) and `build/csp.ts` (Pages `<meta>` build, `QA_TOOLBOX_TARGET=pages`); `build/csp.test.ts` fails if they drift.
- Budgets: entry ≤ 150 KB gzip, each tool route ≤ 600 KB gzip (`scripts/check-bundle.mjs`, keyed by tool source path), exactly one installed copy of `@codemirror/state`/`@codemirror/view` (Vite `resolve.dedupe`), 20 MB open < 3 s, 5 MB compare < 3 s.
- The runtime image runs `apk upgrade` because the Trivy scan in CI fails on fixable HIGH/CRITICAL OS packages; base images and GitHub Actions are pinned by digest/SHA.

## Testing gotchas

- Vitest runs in jsdom; `src/test/setup.ts` adds RTL `afterEach(cleanup)` and CodeMirror `Range` polyfills. Tests that read files via `import.meta.url` need `// @vitest-environment node` on line 1.
- vanilla-jsoneditor renders its own "Format JSON…", "Auto repair" and mode buttons, so E2E selectors for our toolbar must be scoped: `page.getByRole('toolbar', { name: 'Left JSON actions' })` (or `Right`) with `exact: true`.
- JSON tool test ids: panes `json-left`/`json-right`, editors `json-editor-left`/`json-editor-right`, file inputs `file-input-left`/`file-input-right`, statuses `status-left`/`status-right`, `compare-summary`; the Compare checkbox is labelled `Compare` inside the `Compare controls` group; toolbars are `Left JSON actions`/`Right JSON actions`.
- `e2e/support/codemirror.ts` has `setCodeMirrorText`/`readCodeMirrorText` for typing into and reading editors.

## Project rules

- **Existing tests are protected:** never modify, rewrite, weaken, skip or delete an existing test or test config (coverage thresholds, `testIgnore`, budgets, `PERF_MARGIN`) without the user's explicit confirmation. Adding new tests is fine; when a test fails, fix the implementation.
- **Commit messages and PR descriptions describe only the change** — no `Co-Authored-By` trailers, model names or tool attribution. Conventional Commits.
- UI colors come from the theme tokens in `src/app/styles.css` (light and dark); keep text at WCAG AA contrast in both themes and honor `prefers-reduced-motion`.
