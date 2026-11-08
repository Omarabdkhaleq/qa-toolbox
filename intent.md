# devbox — Intent & Design

> Status: approved design (brainstorming session, 2026-11-08), updated with plan-time refinements (§11). Implementation plan: [`plan.md`](./plan.md).

## 1. Intent

### What we're building
A **local, private, offline developer/QA toolbox** that runs in the browser and ships as a Docker image. It starts as a [jsoneditoronline.org](https://jsoneditoronline.org/)-style JSON editor and grows, tool by tool, into a single home for the converters, diffs, formatters, and helpers normally scattered across random websites.

### Why
| Goal | What it means for the design |
|---|---|
| **Privacy** | Pasted data (API responses, tokens, customer data) never leaves the browser — not even to the container serving the app. |
| **Offline & speed** | Zero network calls after load; heavy work kept off the UI thread; measured performance budgets. |
| **One dev/QA toolbox** | Adding a tool must be cheap and must not disturb existing tools. |
| **Learning / portfolio** | Clean architecture, strong tests, CI/CD, published image, live demo. |

### Who it's for
The author, plus anyone they share the Docker image (or demo link) with. Single-user, no accounts, no auth.

### Success criteria
1. `docker run --rm -p 8080:8080 ghcr.io/<owner>/devbox` → open `http://localhost:8080` → every v1 JSON task works with the network disconnected.
2. Adding a new tool (e.g. Base64) = **one new folder + one line in the registry**, with tests, and zero changes to existing tools.
3. CI proves the privacy claim: an automated test fails if any tool makes a non-localhost request.
4. Performance budgets (§6.2) are enforced in CI.

### Decisions made (from the user)
- Local **web app**, packaged as a **Docker image** to share.
- JSON v1 scope: **text + tree views, format/minify/repair, compare/diff, query & transform (incl. JSON Schema validation)**.
- **Stateless v1**: one document per browser tab; no in-app tabs, no storage of user data. Persistence comes later (v1.4).
- Stack: **React + TypeScript (~6.0) + Vite**.
- Quality: **unit + E2E + CI**.
- Approach **A + X**: compile-time tool registry + reuse `vanilla-jsoneditor` for the JSON tool; own the shared core used by all other tools.
- Roadmap order (§9): Text tools → QA helpers → Encoders → Persistence → XML → YAML.

### Assumptions (confirmed)
- All processing is client-side. The container is a static file server (nginx) only.
- No telemetry, no analytics, no CDN assets, no remote fonts.
- Tools are added by code + rebuild — no runtime plugin loading.
- Large inputs (~20 MB JSON) must remain usable.

### Non-goals (v1)
- Runtime plugins / third-party extensions.
- Accounts, sync, sharing documents via URL or server.
- Persistence of user data (deferred to v1.4).
- In-app tabs (deferred to v1.4).
- JavaScript/Lodash query languages (require `eval`; conflict with CSP — §6.3).
- "Ignore array order" in Compare (ambiguous for arrays of objects).
- Command palette (added in v1.1 once there are enough tools).

## 2. Architecture

```
┌─────────────── Docker image (nginx-unprivileged, ~25MB) ──────────┐
│  serves static /dist  ·  security headers  ·  strict CSP          │
└───────────────────────────────────────────────────────────────────┘
                 │ browser loads once, then everything is local
┌─────────────────────────── App shell ─────────────────────────────┐
│  Sidebar (generated from registry) · Theme toggle                  │
│  Hash router: /#/tools/:toolId ──► lazy-load tool chunk            │
│  <ToolErrorBoundary> around each tool                              │
├────────────────────────────────────────────────────────────────────┤
│  Tool registry: ToolDefinition[]                                   │
├──────────────────────────┬─────────────────────────────────────────┤
│ tools/json-editor        │ tools/json-compare     │ (future tools) │
├──────────────────────────┴─────────────────────────────────────────┤
│  core/: formats · editor · json-view · diff · worker · io          │
└────────────────────────────────────────────────────────────────────┘
```

### Repository layout
```
devbox/
├─ src/
│  ├─ app/                 shell: layout, hash router, sidebar, theme, error boundary
│  ├─ architecture/        tests that enforce the dependency rules below
│  ├─ core/
│  │  ├─ text.ts           BOM stripping, offset → line/column, byte formatting
│  │  ├─ formats/          FormatAdapter interface + lossless JSON adapter
│  │  ├─ editor/           <CodeEditor> (CodeMirror 6)
│  │  ├─ json-view/        <JsonEditorView> — the ONLY importer of vanilla-jsoneditor
│  │  ├─ diff/             structuralDiff() · <TextDiffView> · <ChangeList>
│  │  ├─ worker/           runInWorker() · exposeWorker()
│  │  ├─ react/            useDebouncedValue · useAsyncValue
│  │  ├─ theme/            useIsDarkTheme
│  │  ├─ ui/               <Banner>
│  │  └─ io/               copy, download, read dropped/selected file
│  ├─ tools/
│  │  ├─ types.ts          ToolDefinition
│  │  ├─ registry.ts       the single list of tools
│  │  ├─ json-editor/      index.ts · JsonEditorTool.tsx · logic.ts · status.worker.ts · *.test.ts
│  │  └─ json-compare/     index.ts · JsonCompareTool.tsx · logic.ts · compare.worker.ts · *.test.ts
│  └─ main.tsx
├─ e2e/                    Playwright specs (registry smoke, no-egress, perf, container)
├─ fixtures/               small committed test data; large files generated at test time
├─ build/csp.ts            CSP source of truth for the Pages build (drift-tested against nginx)
├─ scripts/check-bundle.mjs  per-route bundle budgets + single-copy CodeMirror check
├─ docker/                 nginx.conf · security-headers.conf
├─ docs/decisions/         ADRs (0001: schema validator spike)
├─ Dockerfile · docker-compose.yml
├─ .github/workflows/      ci.yml · release.yml
└─ intent.md · plan.md
```

### Dependency rules (enforced by `src/architecture/` tests)
1. `core/` never imports from `tools/` or `app/`.
2. A tool never imports from another tool. Shared needs move to `core/`.
3. Only `core/json-view/` may import `vanilla-jsoneditor` (swappable dependency).
4. Each tool keeps pure logic in `logic.ts` (no `react`, `react-dom`, or `@codemirror/view`) — the unit-test target.
5. Relative imports only (no path aliases), so the architecture test can resolve every import.

## 3. Contracts

### 3.1 ToolDefinition
```ts
// src/tools/types.ts
export type ToolCategory = 'data' | 'text' | 'encode' | 'qa';

export interface ToolDefinition {
  id: string;              // kebab-case; route = /#/tools/<id>
  name: string;            // display name
  category: ToolCategory;
  description: string;     // non-empty; sidebar tooltip
  keywords: string[];      // future search/palette
  load: () => Promise<{ default: React.ComponentType }>; // lazy chunk
}
```
```ts
// src/tools/registry.ts — the only file touched to add a tool
export const tools: ToolDefinition[] = [jsonEditor, jsonCompare];
```
Registry invariants (unit-tested): ids unique, kebab-case, non-empty name/description.

### 3.2 FormatAdapter
```ts
// src/core/formats/types.ts
export type FormatId = 'json'; // grows: 'xml' | 'csv' | 'yaml' | 'toml'

export interface ParseError { message: string; line?: number; column?: number }
export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: ParseError };

export interface FormatAdapter<Opts = unknown> {
  id: FormatId;
  label: string;
  parse(text: string): ParseResult;          // never throws
  stringify(value: unknown, opts?: Opts): string;
}
```
v1 ships only the JSON adapter (`parse` with 1-based line/column, `stringify` with `indent: 2 | 4 | '\t' | 0` and `sortKeys`). It is built on **`lossless-json`**, so big integers and long decimals survive format/minify/sort/compare unchanged, and duplicate keys with different values are reported as errors. A leading BOM is accepted. `repairJson(text)` (via `jsonrepair`) is a separate exported function, not part of the adapter. Auto-detection (`detect`) is deferred until a second format exists (v1.5).

### 3.3 Shared core (v1)
| Unit | Interface | Depends on |
|---|---|---|
| `<CodeEditor>` | `value, onChange, language, readOnly?, errors?: ParseError[]` | CodeMirror 6 |
| `<JsonEditorView>` | `value: string, onChange(text), mode: 'text'\|'tree'\|'table', validator?` | vanilla-jsoneditor |
| `structuralDiff()` | `(left: unknown, right: unknown) → Change[]` on parsed values (format-agnostic); array items matched by `id`/`_id`/`uuid` | `jsondiffpatch` |
| `<TextDiffView>` | `left, right, language?` + handle `next() / prev() / scrollToLine(side, line)` | `@codemirror/merge` |
| `<ChangeList>` | `changes, onSelect?` | — |
| `runInWorker` | `runInWorker<I, O>(createWorker, input, {timeoutMs, signal}) → Promise<O>`; inputs > 1,000,000 chars go to a worker | Web Workers |
| `io` | `copyToClipboard(text)`, `downloadText(name, text, mime)`, `readFileAsText(file)` | browser APIs |

### 3.4 App shell
- Sidebar grouped by category, generated from the registry.
- Header: app name, theme toggle (light / dark / system; stored in `localStorage` — UI preference, never user data).
- `<ToolErrorBoundary>` per tool: crash → "This tool crashed" + Reload + copyable details; shell stays alive.
- Default route redirects to `/#/tools/json-editor`; unknown tool id → "Tool not found" with link home.

## 4. v1 tools

### 4.1 JSON Editor (`/#/tools/json-editor`)
| Feature | Implementation |
|---|---|
| Text / Tree / Table views | `vanilla-jsoneditor` modes via `<JsonEditorView>` |
| Format (2 / 4 / tab), Minify, Sort keys | `formats/json.stringify` options; pure functions in `logic.ts` |
| Repair | `jsonrepair`; toolbar button + inline "Repair?" on parse failure |
| Query & transform | Built-in transform modal, query languages limited to **JSONQuery, JMESPath, JSONPath** |
| Schema validation | Collapsible side panel (`<CodeEditor>`) for the schema; validator built on **`@cfworker/json-schema`** and passed to the editor; errors shown inline |
| Input / output | Paste, drag-drop file, file picker (read-only), copy, download `.json` |
| Status bar | Valid / invalid (line:col), size, node count; neutral "Empty" state for blank input; computed in a Web Worker above 1M chars |

### 4.2 JSON Compare (`/#/tools/json-compare`)
- Two editable panes (`<CodeEditor language="json">`); swap; drop/pick a file into either side.
- **Text diff**: both sides normalized (format + sort keys when "Ignore key order" is on — default **on**) → `<TextDiffView>` with next/prev change navigation.
- **Structural diff** (default tab): `structuralDiff()` → flat change list by JSONPath (`$.users[2].email`: `"a"` → `"b"`), with added/removed/changed/moved counts; arrays of objects with `id` show reorders as moves; click a change to jump to it in the text diff.
- Summary distinguishes **"No differences"** from **"Same data — key order or number notation differs"** (e.g. `1.0` vs `1`).
- Normalization + diff run in a Web Worker via `runInWorker` when combined input > 1,000,000 chars.
- Either side empty → "Paste JSON on both sides to compare". Either side invalid → that pane shows the parse error; summary shows "Fix the JSON errors to compare".

### 4.3 Data flow (all tools)
```
input (paste / type / drop) → text (React state — single source of truth)
  → debounce ~150 ms → adapter.parse(text) → ParseResult
       ok:   value → tool logic (format / diff / query) → output text / view
       fail: ParseError → inline marker + status bar
```
`<JsonEditorView>` encapsulates the library's internal `{text}|{json}` content model and emits only `onChange(text)`.

## 5. Error handling
| Layer | Catches | User sees |
|---|---|---|
| `ParseResult` | Invalid input | Inline marker at line:col, status bar message, "Repair?" for JSON — never a crash |
| Tool logic | Failed query, invalid schema, worker error/timeout | Dismissible banner inside the tool; input preserved |
| `<ToolErrorBoundary>` | Unexpected render/runtime error | Fallback with Reload + copyable details; rest of app unaffected |

No error is ever transmitted anywhere. Details are logged to the console only.

## 6. Non-functional requirements

### 6.1 Offline & privacy
- No outbound requests after load. All fonts/assets bundled. No analytics.
- Enforced by `e2e/no-egress.spec.ts`: visits every registered tool, exercises it, fails on any request whose host is not the app origin.

### 6.2 Performance budgets (enforced in CI)
| Budget | Target | Checked by |
|---|---|---|
| Initial JS (shell, no tool) | ≤ 150 KB gzip | `scripts/check-bundle.mjs` (Vite manifest) |
| Each tool route (lazy chunk + its imports not in the entry) | ≤ 600 KB gzip | `scripts/check-bundle.mjs` |
| Open 20 MB JSON (text mode) | < 3 s | Playwright perf spec (Chromium) |
| Compare two 5 MB docs | < 3 s, UI responsive (max frame gap < 1 s) | Playwright perf spec (Chromium) |
| Installed copies of `@codemirror/state` / `@codemirror/view` | exactly 1 | Vite `resolve.dedupe` + `npm ls` in `check-bundle.mjs` |

Perf specs use generous margins to avoid CI flakiness; they catch large regressions only. Tree-view performance on huge documents is delegated to the library (virtualized); the 20 MB budget is for text mode.

### 6.3 Security
- **CSP (nginx header):** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. `build/csp.ts` holds the same directives for the Pages build; a unit test fails if the two drift.
  - `style-src 'unsafe-inline'`: required by the editor library's injected styles.
  - No `unsafe-eval` → JavaScript/Lodash query languages excluded; Ajv replaced by `@cfworker/json-schema`. **Fallback** (only if the schema-validator spike in plan.md fails): Ajv + `script-src 'unsafe-eval'` — does not open any network path but weakens the policy.
- Other headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Container: `nginxinc/nginx-unprivileged:alpine`, non-root, port 8080, compatible with `--read-only` + tmpfs (documented).
- Supply chain: `npm audit --omit=dev --audit-level=high` in CI, Dependabot weekly (npm, actions, docker), Trivy image scan (HIGH/CRITICAL fail) run from a digest-pinned image, and every third-party GitHub Action pinned to a commit SHA.
- Clipboard: works over plain `http://<LAN-IP>` (non-secure context) via an `execCommand` fallback, or shows a clear error — never fails silently.
- GitHub Pages demo: same build with an equivalent CSP `<meta>` (minus `frame-ancestors`, unsupported in meta). The Docker image is the full-guarantee artifact.

## 7. Testing strategy
| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Every `logic.ts`, format adapters, registry invariants — written test-first |
| Component | Vitest + Testing Library | Shared core components, shell, error boundary |
| E2E | Playwright (Chromium, Firefox, WebKit) | User flows against the **built** app |
| Contract | Playwright | `registry-smoke.spec.ts`: every registered tool loads, shows its title, emits no console errors |
| Privacy | Playwright | `no-egress.spec.ts` |
| Perf | Playwright (Chromium) | Budgets in §6.2 |
| Container | Playwright | Smoke + header/CSP assertions against the running Docker image |

| Architecture | Vitest | `src/architecture/`: dependency rules in §2 |

Coverage gate: **≥ 90% lines** on `src/core/**/*.ts` and `src/tools/*/logic.ts` (`.tsx`, `*.worker.ts`, type-only files excluded; UI is covered by E2E).

## 8. Delivery

### CI (`.github/workflows/ci.yml`, on PR + push to `main`)
```
verify: lint · format · typecheck · unit+coverage · build · check-bundle · npm audit
   ├─► e2e (matrix: chromium, firefox, webkit — vite preview of dist)
   ├─► perf (chromium, PERF_MARGIN=2)
   └─► container: docker build ─► trivy ─► run --read-only ─► container e2e
```

### Release (`.github/workflows/release.yml`, on tag `v*.*.*`)
- `docker buildx` multi-arch (**linux/amd64 + linux/arm64**) → `ghcr.io/<owner>/devbox:{version,latest}`
- Deploy `dist/` to GitHub Pages (live demo)
- GitHub Release with generated release notes

### Docker
- Multi-stage: `node:24-alpine` (`npm ci && npm run build`) → `nginxinc/nginx-unprivileged:alpine`.
- Hash routing → no SPA rewrites. Hashed assets: `Cache-Control: public, max-age=31536000, immutable`; `index.html`: `no-cache`.
- `GET /healthz` → 200 (static nginx location); Docker `HEALTHCHECK` uses it.
- Local: `npm run dev` for development; `docker compose up --build` to run the production image.

### Versioning
SemVer + Conventional Commits.

## 9. Roadmap (each milestone gets its own plan)
| Version | Scope | Notes |
|---|---|---|
| **v1** | JSON Editor + JSON Compare | This design / `plan.md` |
| v1.1 | Text tools: text diff, regex tester, case convert, sort/dedupe lines; **command palette** | Text diff reuses `<TextDiffView>` |
| v1.2 | QA helpers: JSON Schema → test data, cURL ↔ JSON, API response compare | Builds on Compare + schema validation |
| v1.3 | Encoders: Base64, URL, JWT decode, hashes, UUID, timestamps | |
| v1.4 | Persistence: in-app tabs, IndexedDB, File System Access open/save | `{format, text}` documents are the extension point; `localhost` is a secure context so FS Access works from Docker |
| v1.5 | XML (+ CSV) adapters + **Convert tool** | First milestone with a second format |
| v1.6 | YAML (+ TOML) adapters | Plug into Convert / Editor / Compare via the adapter layer |

## 10. Risks
| Risk | Mitigation |
|---|---|
| `@cfworker/json-schema` integration with editor validator hook | Early spike task in plan.md; documented Ajv fallback |
| Editor library injects styles / uses features that break CSP | Container e2e asserts zero CSP violations in console |
| Duplicate CodeMirror via library | `resolve.dedupe` + CI bundle check |
| Heavy dependency on `vanilla-jsoneditor` | Isolated behind `<JsonEditorView>` (architecture-test enforced) |
| Flaky perf tests in CI | Generous margins (`PERF_MARGIN`), Chromium only, CI retries |
| Third-party action/image tag rewrites | Pin by commit SHA / image digest; Dependabot keeps them current |

## 11. Plan-time refinements (2026-11-08)
Decided while verifying library APIs and versions for `plan.md`; already reflected in the sections above.

| # | Originally | Now | Why |
|---|---|---|---|
| 1 | TypeScript version unspecified | TypeScript ~6.0 | typescript-eslint supports `<6.1` |
| 2 | ESLint `import/no-restricted-paths` | Architecture test in `src/architecture/` | No plugin; can express "a tool never imports another tool" |
| 3 | `size-limit` | `scripts/check-bundle.mjs` | Budgets are per route; also checks single-copy CodeMirror |
| 4 | JSON parser unspecified | `lossless-json` | Big numbers survive; duplicate keys reported |
| 5 | `<DiffView left right mode>` | `structuralDiff()` + `<TextDiffView>` + `<ChangeList>` | Format-agnostic diff; smaller testable units |
| 6 | `runInWorker` arrives with Compare | Arrives before both tools | Editor status also uses a worker for large docs |
| 7 | `View.tsx` | `<Name>Tool.tsx` | Unique chunk names for bundle budgets |
| 8 | `worker-src 'self' blob:` | `worker-src 'self'` + `form-action 'none'` | Least privilege |
| 9 | Router unspecified | ~20-line hash router | Small entry bundle |
| 10 | Trivy in CI | Digest-pinned Trivy; SHA-pinned actions | Supply-chain hardening |
| 11 | "Identical" message | "No differences" vs "Same data — key order or number notation differs" | Data-equal ≠ text-equal |
