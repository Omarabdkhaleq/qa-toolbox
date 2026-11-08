# devbox

A private, offline toolbox for developers and QA engineers. Everything runs in your browser — pasted data never leaves your machine, not even to the container serving the app.

**v1 tools:** JSON Editor (text / tree / table, format, minify, sort keys, repair, JSONQuery / JMESPath / JSONPath, JSON Schema validation) and JSON Compare (structural changes + side-by-side text diff).

## Run it

```bash
docker run --rm -p 8080:8080 ghcr.io/<owner>/devbox
```

Open http://localhost:8080. Works on amd64 and arm64 (Apple Silicon).

Hardened mode (read-only filesystem):

```bash
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp ghcr.io/<owner>/devbox
```

Live demo: `https://<owner>.github.io/qa-toolbox/` (same build; CSP via `<meta>`, so `frame-ancestors` is not enforced there).

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
docker compose up --build -d && BASE_URL=http://localhost:8080 npm run e2e:container
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

Push a tag `vX.Y.Z`. CI publishes `ghcr.io/<owner>/devbox:{X.Y.Z,latest}` (amd64 + arm64), deploys the Pages demo, and creates a GitHub Release with generated notes.
