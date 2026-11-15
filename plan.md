# qa-toolbox v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship qa-toolbox v1 — a private, offline, Dockerized browser toolbox with a JSON Editor and JSON Compare, built on an extensible tool registry.

**Architecture:** A React SPA (hash routing) whose shell renders tools from a compile-time registry; each tool is a lazy-loaded folder with pure `logic.ts`. Shared building blocks live in `src/core/` (format adapters, CodeMirror editor, `vanilla-jsoneditor` wrapper, diff, workers, I/O). The production build is served by an unprivileged nginx container with a strict CSP; all processing happens in the browser.

**Tech Stack:** Node 24, React 19, TypeScript 6.0, Vite 8, Vitest 5 + Testing Library, Playwright 1.65, CodeMirror 6, vanilla-jsoneditor 3, lossless-json, jsonrepair, jsondiffpatch, @cfworker/json-schema, nginx-unprivileged, GitHub Actions.

**Spec:** [`intent.md`](./intent.md) — read it before starting. Where this plan refines the spec, the [Plan-time refinements](#plan-time-refinements) table below says what changed and why; the plan wins on those points.

## Global Constraints

- Node **24** (`.nvmrc`), npm. TypeScript **~6.0** (typescript-eslint supports `<6.1`).
- **No runtime network access**: no CDN scripts, no remote fonts (system font stack only), no analytics, no telemetry.
- **No code generation at runtime**: never use `eval`, `new Function`, the JavaScript or Lodash query languages, or Ajv (unless Task 8's spike fails — see that task).
- CSP (exact directive set, nginx header): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- Import rules (enforced by `src/architecture/`): `src/core/**` never imports `src/tools/**` or `src/app/**`; a tool never imports another tool; only `src/core/json-view/**` imports `vanilla-jsoneditor`; `logic.ts` files never import `react`, `react-dom`, or `@codemirror/view`.
- **Relative imports only** — no path aliases (the architecture test resolves relative paths).
- Routing: hash routes `/#/tools/<id>`; Vite `base: './'`.
- Coverage: **≥ 90 % lines** across `src/core/**/*.ts` and `src/tools/*/logic.ts` (`.tsx`, `*.worker.ts`, `types.ts` excluded).
- Budgets: entry JS **≤ 150 KB gzip**; each tool route (lazy chunk + its imports not already in the entry) **≤ 600 KB gzip**; open 20 MB JSON (text mode) **< 3 s**; compare two 5 MB docs **< 3 s**; exactly **one** installed copy of `@codemirror/state` and `@codemirror/view`. Budgets change only with the user's agreement.
- Inputs larger than **1,000,000 characters** are processed in a Web Worker (`WORKER_THRESHOLD_CHARS`).
- Container: `nginxinc/nginx-unprivileged`, port **8080**, non-root, `GET /healthz` → 200, works with `--read-only --tmpfs /tmp`.
- Image: `ghcr.io/<owner>/qa-toolbox:{version,latest}`, platforms `linux/amd64,linux/arm64`. `<owner>` = the GitHub account hosting the repo (CI derives it from `github.repository_owner`).
- **Tests are protected: no one — human contributor, agent, or subagent — may modify, rewrite, weaken, skip, or delete an existing test (unit, component, E2E, perf, container, architecture) without the user's explicit confirmation.** Writing *new* tests as a task's TDD step is allowed. When an existing test fails, fix the implementation; if you believe the test itself is wrong, stop, explain why with actual vs expected output, and wait for the user's yes. This also applies to test config that changes what runs or passes (coverage thresholds, `testIgnore`, budgets, `PERF_MARGIN`).
- Never commit `.idea/` or editor swap files; never let Prettier rewrite Markdown (`*.md` is in `.prettierignore`).
- Commits: Conventional Commits. Messages describe only the change — no co-author trailers, no model or tool names.

## Review Focus

1. **Large integers / high-precision numbers** (IDs like `12345678901234567890`) — Format, Minify, Sort keys, and Compare must never round them. Pinned in Task 9 (adapter tests), Task 14 (logic + e2e), Task 16 (logic + e2e).
2. **UTF-8 BOM and binary files** — a `.json` saved by Windows tools starts with `U+FEFF` and must parse; a dropped binary file must be rejected with a clear message, not dumped into the editor. Pinned in Task 9 (BOM parse), Task 10 (file reader), Task 14 (e2e).
3. **Clipboard in a non-secure context** — opening the container via `http://<LAN-IP>:8080` disables `navigator.clipboard`; Copy must fall back or show an error, never silently do nothing. Pinned in Task 10.
4. **Empty input** — an empty editor/pane shows a neutral "Empty" / "Paste JSON on both sides" state, never a red parse error. Pinned in Task 14 (logic + e2e) and Task 16 (logic + e2e).
5. **Semantically identical documents** — same data with different key order or formatting must report "No differences" (or "Same data — key order or number notation differs"), and reordered arrays of objects with `id` must show moves, not a wall of changes. Pinned in Task 15 (diff test) and Task 16 (logic + e2e).

## Plan-time refinements

Decisions made while verifying library APIs and versions (2026-11-08). They don't change the product and are merged into `intent.md` (its §11 and the affected sections).

| # | intent.md | This plan | Why |
|---|---|---|---|
| 1 | TypeScript version unspecified | TypeScript **~6.0** | typescript-eslint 8 supports `<6.1`; TS 7 would break linting |
| 2 | Dependency rules via ESLint `import/no-restricted-paths` | Architecture test in `src/architecture/` | No plugin; expresses "a tool never imports another tool", which the lint rule can't state generically |
| 3 | `size-limit` | `scripts/check-bundle.mjs` reading Vite's manifest | Budgets are per *route* (chunk + imports), which size-limit can't compute; also checks single-copy CodeMirror via `npm ls` |
| 4 | JSON adapter (parser unspecified) | `lossless-json` | Big integers and long decimals survive (Review Focus 1); duplicate keys with different values are reported as errors |
| 5 | `<DiffView left right mode>` | `core/diff/`: `structuralDiff()`, `<TextDiffView>`, `<ChangeList>` | Structural diff works on parsed values, so YAML/XML get it for free later; smaller, testable units |
| 6 | `runInWorker` introduced with Compare | Introduced before both tools | JSON Editor's status (parse + node count) also runs in a worker above 1M chars |
| 7 | Tool UI file `View.tsx` | `<Name>Tool.tsx` | Unique chunk names; bundle budgets are keyed by these paths |
| 8 | `worker-src 'self' blob:` | `worker-src 'self'`, plus `form-action 'none'` | No blob workers are used; least privilege |
| 9 | Router unspecified | 20-line hash router, no react-router | Keeps the entry bundle small |
| 10 | Trivy in CI | Trivy via a digest-pinned image; actions pinned by commit SHA | Tag-rewrite supply-chain attacks |
| 11 | Compare "identical" message | "No differences" vs "Same data — key order or number notation differs" | `1.0` vs `1` and key order are data-equal but text-different |

---

## File Structure

```
qa-toolbox/
├─ .github/workflows/ci.yml · release.yml        Task 7, 18
├─ .github/dependabot.yml                         Task 7
├─ build/csp.ts · csp.test.ts                     Task 18 (CSP source of truth for Pages + drift test)
├─ docker/nginx.conf · security-headers.conf      Task 6
├─ docs/decisions/0001-schema-validator.md        Task 8
├─ e2e/
│  ├─ support/app.ts · exercise.ts                Task 5
│  ├─ support/codemirror.ts                       Task 14
│  ├─ support/generate.ts                         Task 17
│  ├─ registry-smoke.spec.ts · no-egress.spec.ts  Task 5
│  ├─ container/headers.spec.ts                   Task 6 (+ Task 17)
│  ├─ json-editor.spec.ts                         Task 14
│  ├─ json-compare.spec.ts                        Task 16
│  └─ perf.spec.ts                                Task 17
├─ fixtures/bom.json                              Task 14
├─ scripts/check-bundle.mjs                       Task 7
├─ src/
│  ├─ main.tsx
│  ├─ architecture/rules.ts · rules.test.ts · tree.test.ts            Task 2
│  ├─ app/  App.tsx · Sidebar.tsx · ToolHost.tsx · ToolErrorBoundary.tsx
│  │        ThemeToggle.tsx · router.ts · theme.ts · styles.css (+ tests)  Task 3, 4
│  ├─ core/
│  │  ├─ text.ts                                  Task 9
│  │  ├─ formats/types.ts · errors.ts · json.ts   Task 9
│  │  ├─ io/clipboard.ts · download.ts · file.ts · useFileDrop.ts     Task 10
│  │  ├─ worker/protocol.ts · runInWorker.ts · expose.ts               Task 11
│  │  ├─ react/useDebouncedValue.ts · useAsyncValue.ts                 Task 11
│  │  ├─ theme/useIsDarkTheme.ts                  Task 12
│  │  ├─ editor/CodeEditor.tsx · theme.ts · diagnostics.ts · code-editor.css   Task 12
│  │  ├─ json-view/JsonEditorView.tsx · queryLanguages.ts · schemaValidator.ts · json-view.css  Task 13
│  │  ├─ ui/Banner.tsx                            Task 14
│  │  └─ diff/paths.ts · structural.ts · format.ts · TextDiffView.tsx · ChangeList.tsx · diff.css  Task 15
│  ├─ tools/
│  │  ├─ types.ts · registry.ts · validateRegistry.ts                  Task 3
│  │  ├─ json-editor/index.ts · JsonEditorTool.tsx · logic.ts · status.worker.ts · SchemaPanel.tsx · json-editor.css  Task 3, 14
│  │  └─ json-compare/index.ts · JsonCompareTool.tsx · ComparePane.tsx · logic.ts · compare.worker.ts · json-compare.css  Task 16
│  ├─ test/setup.ts · toolchain.test.tsx          Task 1, 12
│  └─ types/json-source-map.d.ts                  Task 16
├─ Dockerfile · .dockerignore · docker-compose.yml   Task 6
├─ index.html · public/favicon.svg                Task 1
├─ package.json · tsconfig.json · vite.config.ts · eslint.config.js · playwright.config.ts
├─ .prettierrc.json · .prettierignore · .gitignore · .nvmrc
└─ README.md                                      Task 18
```

Tasks 1–7 are the **walking skeleton**: at the end of Task 7 the app builds, ships as a container, and CI is green, with a placeholder JSON Editor. Features follow.

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `public/favicon.svg`, `src/main.tsx`, `src/test/setup.ts`
- Test: `src/test/toolchain.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:watch`, `coverage`, `verify`. Vitest runs `src/**/*.test.{ts,tsx}` and `build/**/*.test.ts` in jsdom with `src/test/setup.ts`.

- [ ] **Step 1: Create the base files**

`package.json`:
```json
{
  "name": "qa-toolbox",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "verify": "npm run lint && npm run format:check && npm run typecheck && npm run coverage && npm run build"
  }
}
```

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules/
dist/
coverage/
playwright-report/
test-results/
blob-report/
*.local
.DS_Store
.idea/
*.swp
```

`.prettierrc.json`:
```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:
```
dist
coverage
playwright-report
test-results
package-lock.json
*.md
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "e2e", "build", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // One copy of CodeMirror even though vanilla-jsoneditor also depends on it.
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language'],
  },
  build: { manifest: true, target: 'es2022' },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/tools/*/logic.ts'],
      exclude: ['**/*.test.*', '**/*.worker.ts', '**/types.ts', '**/protocol.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 90 },
    },
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <title>qa-toolbox</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2f6feb"/><text x="16" y="22" font-family="monospace" font-size="16" fill="#fff" text-anchor="middle">{}</text></svg>
```

`src/main.tsx` (placeholder until Task 4):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>qa-toolbox</h1>
  </StrictMode>,
);
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript@~6.0.3 @types/react @types/react-dom @types/node \
  vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals prettier
```
Expected: installs without peer-dependency errors.

- [ ] **Step 3: Write the toolchain test**

`src/test/toolchain.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('renders React into jsdom with jest-dom matchers', () => {
    render(<button type="button">Ping</button>);
    expect(screen.getByRole('button', { name: 'Ping' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run every check**

Run: `npm run format && npm run test && npm run lint && npm run typecheck && npm run build`
Expected: 1 test passes; lint, typecheck, and build succeed; `dist/index.html` and `dist/.vite/manifest.json` exist.

- [ ] **Step 5: Commit**

```bash
git add -A
git status --short   # must not list .idea/ or *.swp
git commit -m "chore: scaffold Vite + React + TypeScript toolchain"
```

---

### Task 2: Architecture rules test

**Files:**
- Create: `src/architecture/rules.ts`
- Test: `src/architecture/rules.test.ts`, `src/architecture/tree.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findViolations(files: SourceFile[]): Violation[]` with `SourceFile = { path: string; source: string }` (posix path relative to repo root, e.g. `src/core/a.ts`) and `Violation = { file: string; specifier: string; rule: RuleId }`, `RuleId = 'core-isolation' | 'tool-isolation' | 'editor-library' | 'pure-logic'`. `tree.test.ts` fails the test run on any violation in `src/`.

- [ ] **Step 1: Write the failing rule tests**

`src/architecture/rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findViolations } from './rules';

const file = (path: string, source: string) => ({ path, source });

describe('findViolations', () => {
  it('allows core importing core and tools importing core', () => {
    expect(
      findViolations([
        file('src/core/a.ts', "import { b } from './b';"),
        file('src/tools/x/logic.ts', "import { a } from '../../core/a';"),
      ]),
    ).toEqual([]);
  });

  it('flags core importing tools or app', () => {
    const v = findViolations([
      file('src/core/a.ts', "import { t } from '../tools/x/logic';\nimport { App } from '../app/App';"),
    ]);
    expect(v.map((x) => x.rule)).toEqual(['core-isolation', 'core-isolation']);
  });

  it('flags a tool importing another tool, including dynamic imports', () => {
    const v = findViolations([
      file('src/tools/x/View.tsx', "const m = import('../y/logic');"),
      file('src/tools/x/other.ts', "import { a } from './logic';"),
    ]);
    expect(v).toEqual([{ file: 'src/tools/x/View.tsx', specifier: '../y/logic', rule: 'tool-isolation' }]);
  });

  it('allows the registry to import tools', () => {
    expect(findViolations([file('src/tools/registry.ts', "import { x } from './x';")])).toEqual([]);
  });

  it('only lets core/json-view import vanilla-jsoneditor', () => {
    const v = findViolations([
      file('src/core/json-view/JsonEditorView.tsx', "import { createJSONEditor } from 'vanilla-jsoneditor';"),
      file('src/tools/x/View.tsx', "import 'vanilla-jsoneditor/themes/jse-theme-dark.css';"),
    ]);
    expect(v).toEqual([
      {
        file: 'src/tools/x/View.tsx',
        specifier: 'vanilla-jsoneditor/themes/jse-theme-dark.css',
        rule: 'editor-library',
      },
    ]);
  });

  it('keeps logic.ts free of React and DOM editor code', () => {
    const v = findViolations([
      file(
        'src/tools/x/logic.ts',
        "import { useState } from 'react';\nexport type { EditorView } from '@codemirror/view';",
      ),
    ]);
    expect(v.map((x) => x.rule)).toEqual(['pure-logic', 'pure-logic']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/architecture/rules.test.ts`
Expected: FAIL — `Failed to resolve import "./rules"`.

- [ ] **Step 3: Implement the rules**

`src/architecture/rules.ts`:
```ts
import { posix } from 'node:path';

export interface SourceFile {
  path: string;
  source: string;
}
export type RuleId = 'core-isolation' | 'tool-isolation' | 'editor-library' | 'pure-logic';
export interface Violation {
  file: string;
  specifier: string;
  rule: RuleId;
}

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const TOOL_DIR_RE = /^src\/tools\/([^/]+)\//;
const PURE_LOGIC_FORBIDDEN = ['react', 'react-dom', '@codemirror/view'];

function specifiersOf(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) out.push(spec);
  }
  return out;
}

function resolve(fromFile: string, spec: string): string | null {
  return spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(fromFile), spec)) : null;
}

function isPackage(spec: string, name: string): boolean {
  return spec === name || spec.startsWith(`${name}/`);
}

export function findViolations(files: SourceFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const { path, source } of files) {
    const ownTool = TOOL_DIR_RE.exec(path)?.[1];
    for (const specifier of specifiersOf(source)) {
      const resolved = resolve(path, specifier);
      const add = (rule: RuleId) => violations.push({ file: path, specifier, rule });

      if (path.startsWith('src/core/') && resolved && /^src\/(tools|app)\//.test(resolved)) {
        add('core-isolation');
      }
      const targetTool = resolved ? TOOL_DIR_RE.exec(resolved)?.[1] : undefined;
      if (ownTool && targetTool && ownTool !== targetTool) add('tool-isolation');
      if (isPackage(specifier, 'vanilla-jsoneditor') && !path.startsWith('src/core/json-view/')) {
        add('editor-library');
      }
      if (path.endsWith('/logic.ts') && PURE_LOGIC_FORBIDDEN.some((p) => isPackage(specifier, p))) {
        add('pure-logic');
      }
    }
  }
  return violations;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/architecture/rules.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the real-tree check**

`src/architecture/tree.test.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findViolations, type SourceFile } from './rules';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function collect(dir: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    const path = relative(ROOT, full).split(sep).join('/');
    if (entry.isDirectory()) return path === 'src/architecture' ? [] : collect(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [{ path, source: readFileSync(full, 'utf8') }] : [];
  });
}

describe('source tree', () => {
  it('follows the dependency rules in intent.md §2', () => {
    expect(findViolations(collect(join(ROOT, 'src')))).toEqual([]);
  });
});
```

Run: `npx vitest run src/architecture`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/architecture
git commit -m "test: enforce architecture import rules"
```

---

### Task 3: Tool contract, registry, and hash router

**Files:**
- Create: `src/tools/types.ts`, `src/tools/validateRegistry.ts`, `src/tools/registry.ts`, `src/tools/json-editor/index.ts`, `src/tools/json-editor/JsonEditorTool.tsx` (placeholder), `src/app/router.ts`
- Test: `src/tools/registry.test.ts`, `src/app/router.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ToolCategory = 'data' | 'text' | 'encode' | 'qa'`, `CATEGORY_ORDER: readonly ToolCategory[]`, `CATEGORY_LABELS: Record<ToolCategory, string>`, `ToolDefinition { id; name; category; description; keywords: string[]; load: () => Promise<{ default: ComponentType }> }` (all from `src/tools/types.ts`).
  - `validateRegistry(tools: readonly ToolDefinition[]): string[]` (problem messages).
  - `tools: readonly ToolDefinition[]` from `src/tools/registry.ts`.
  - `jsonEditor: ToolDefinition` (id `json-editor`, name `JSON Editor`).
  - `Route = { kind: 'home' } | { kind: 'tool'; toolId: string } | { kind: 'unknown'; path: string }`, `parseRoute(hash: string): Route`, `toolHref(id: string): string` (→ `#/tools/<id>`), `useHashLocation(): string` (from `src/app/router.ts`).

- [ ] **Step 1: Write the failing tests**

`src/tools/registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { tools } from './registry';
import type { ToolDefinition } from './types';
import { validateRegistry } from './validateRegistry';

const tool = (over: Partial<ToolDefinition>): ToolDefinition => ({
  id: 'a-tool',
  name: 'A tool',
  category: 'data',
  description: 'Does a thing',
  keywords: [],
  load: async () => ({ default: () => null }),
  ...over,
});

describe('validateRegistry', () => {
  it('accepts a valid registry', () => {
    expect(validateRegistry([tool({}), tool({ id: 'b' })])).toEqual([]);
  });

  it('reports bad ids, duplicates, and empty text', () => {
    expect(
      validateRegistry([
        tool({ id: 'Bad_Id' }),
        tool({ id: 'dup' }),
        tool({ id: 'dup', name: ' ', description: '' }),
      ]),
    ).toEqual([
      '"Bad_Id": id must be kebab-case',
      '"dup": duplicate id',
      '"dup": name is empty',
      '"dup": description is empty',
    ]);
  });
});

describe('registry', () => {
  it('is valid', () => {
    expect(validateRegistry(tools)).toEqual([]);
  });

  it('contains the JSON Editor', () => {
    expect(tools.map((t) => t.id)).toContain('json-editor');
  });
});
```

`src/app/router.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseRoute, toolHref, useHashLocation } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { kind: 'home' }],
    ['#', { kind: 'home' }],
    ['#/', { kind: 'home' }],
    ['#/tools/json-editor', { kind: 'tool', toolId: 'json-editor' }],
    ['#/tools/json-editor/', { kind: 'tool', toolId: 'json-editor' }],
    ['#/nope', { kind: 'unknown', path: '/nope' }],
    ['#/tools/Bad_Id', { kind: 'unknown', path: '/tools/Bad_Id' }],
  ])('parses %j', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });
});

describe('toolHref', () => {
  it('builds a hash route', () => {
    expect(toolHref('json-editor')).toBe('#/tools/json-editor');
  });
});

describe('useHashLocation', () => {
  it('tracks hash changes', () => {
    window.location.hash = '#/a';
    const { result } = renderHook(() => useHashLocation());
    expect(result.current).toBe('#/a');
    act(() => {
      window.location.hash = '#/b';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('#/b');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/tools src/app`
Expected: FAIL — cannot resolve `./registry`, `./validateRegistry`, `./router`.

- [ ] **Step 3: Implement**

`src/tools/types.ts`:
```ts
import type { ComponentType } from 'react';

export type ToolCategory = 'data' | 'text' | 'encode' | 'qa';

export const CATEGORY_ORDER: readonly ToolCategory[] = ['data', 'text', 'encode', 'qa'];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  data: 'Data',
  text: 'Text',
  encode: 'Encode',
  qa: 'QA',
};

export interface ToolDefinition {
  /** kebab-case; route = /#/tools/<id> */
  id: string;
  name: string;
  category: ToolCategory;
  /** Non-empty; shown as the sidebar tooltip. */
  description: string;
  /** For future search / command palette. */
  keywords: string[];
  /** Lazy chunk. Keep index.ts free of other imports so the chunk stays lazy. */
  load: () => Promise<{ default: ComponentType }>;
}
```

`src/tools/validateRegistry.ts`:
```ts
import type { ToolDefinition } from './types';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateRegistry(tools: readonly ToolDefinition[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of tools) {
    if (!KEBAB.test(t.id)) problems.push(`"${t.id}": id must be kebab-case`);
    if (seen.has(t.id)) problems.push(`"${t.id}": duplicate id`);
    seen.add(t.id);
    if (!t.name.trim()) problems.push(`"${t.id}": name is empty`);
    if (!t.description.trim()) problems.push(`"${t.id}": description is empty`);
  }
  return problems;
}
```

`src/tools/json-editor/index.ts`:
```ts
import type { ToolDefinition } from '../types';

export const jsonEditor: ToolDefinition = {
  id: 'json-editor',
  name: 'JSON Editor',
  category: 'data',
  description: 'View, edit, format, repair, query and validate JSON.',
  keywords: ['json', 'format', 'tree', 'repair', 'schema', 'query', 'jmespath', 'jsonpath'],
  load: () => import('./JsonEditorTool'),
};
```

`src/tools/json-editor/JsonEditorTool.tsx` (placeholder; replaced in Task 14):
```tsx
export default function JsonEditorTool() {
  return <p>The JSON editor is coming soon.</p>;
}
```

`src/tools/registry.ts`:
```ts
import { jsonEditor } from './json-editor';
import type { ToolDefinition } from './types';

/** The only file to touch when adding a tool. */
export const tools: readonly ToolDefinition[] = [jsonEditor];
```

`src/app/router.ts`:
```ts
import { useSyncExternalStore } from 'react';

export type Route =
  | { kind: 'home' }
  | { kind: 'tool'; toolId: string }
  | { kind: 'unknown'; path: string };

const TOOL_ROUTE = /^\/tools\/([a-z0-9-]+)\/?$/;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { kind: 'home' };
  const match = TOOL_ROUTE.exec(path);
  return match?.[1] ? { kind: 'tool', toolId: match[1] } : { kind: 'unknown', path };
}

export function toolHref(id: string): string {
  return `#/tools/${id}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useHashLocation(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/tools src/app src/architecture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/tools src/app
git commit -m "feat: add tool contract, registry, and hash router"
```

---

### Task 4: App shell — layout, sidebar, theme, error boundary

**Files:**
- Create: `src/app/App.tsx`, `src/app/Sidebar.tsx`, `src/app/ToolHost.tsx`, `src/app/ToolErrorBoundary.tsx`, `src/app/ThemeToggle.tsx`, `src/app/theme.ts`, `src/app/styles.css`
- Modify: `src/main.tsx`
- Test: `src/app/App.test.tsx`, `src/app/ToolErrorBoundary.test.tsx`, `src/app/theme.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `parseRoute`, `toolHref`, `useHashLocation`, `tools` (Task 3).
- Produces:
  - `App({ tools }: { tools: readonly ToolDefinition[] })`.
  - Shell renders each tool inside `<section class="tool">` with `<h1 class="tool__title">{tool.name}</h1>` — **tools never render their own h1**. Tool content goes into `<div class="tool__body">`.
  - Sidebar: `<nav aria-label="Tools">` with one `<a href="#/tools/<id>">` per tool, `aria-current="page"` on the active link.
  - `document.documentElement.dataset.theme` is always `'light' | 'dark'` (consumed by `useIsDarkTheme` in Task 12).
  - `ThemePreference = 'light' | 'dark' | 'system'`; `readThemePreference(storage?)`, `writeThemePreference(pref, storage?)`, `resolveTheme(pref, prefersDark)`, `useThemePreference(): [ThemePreference, (p: ThemePreference) => void]`.
  - CSS tokens in `styles.css` (`--bg`, `--fg`, `--accent`, `--danger`, `--added`, …) used by every later stylesheet; shared classes `.toolbar`, `.toolbar__spacer`, `.status-bar`, `.status-bar--valid`, `.status-bar--invalid`, `.banner`, `.banner--error`, `.banner--info`.

- [ ] **Step 1: Write the failing tests**

`src/app/theme.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readThemePreference, resolveTheme, writeThemePreference } from './theme';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('theme preference', () => {
  it('defaults to system and round-trips', () => {
    const s = memoryStorage();
    expect(readThemePreference(s)).toBe('system');
    writeThemePreference('dark', s);
    expect(readThemePreference(s)).toBe('dark');
  });

  it('ignores garbage and throwing storage', () => {
    const s = memoryStorage();
    s.setItem('qa-toolbox.theme', 'purple');
    expect(readThemePreference(s)).toBe('system');
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readThemePreference(throwing)).toBe('system');
    expect(() => writeThemePreference('light', throwing)).not.toThrow();
  });

  it('resolves system against the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
```

`src/app/ToolErrorBoundary.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolErrorBoundary } from './ToolErrorBoundary';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('kaboom');
  return <p>all good</p>;
}

function Harness() {
  const [explode, setExplode] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setExplode(false)}>
        defuse
      </button>
      <ToolErrorBoundary toolName="Bomb">
        <Bomb explode={explode} />
      </ToolErrorBoundary>
    </>
  );
}

describe('ToolErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a fallback with details and recovers on reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('This tool crashed');
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'defuse' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reload tool' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
```

`src/app/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../tools/types';
import { App } from './App';

const fakeTools: ToolDefinition[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    category: 'data',
    description: 'First tool',
    keywords: [],
    load: async () => ({ default: () => <p>alpha body</p> }),
  },
  {
    id: 'crashy',
    name: 'Crashy',
    category: 'text',
    description: 'Always throws',
    keywords: [],
    load: async () => ({
      default: () => {
        throw new Error('boom');
      },
    }),
  },
];

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  afterEach(() => vi.restoreAllMocks());

  it('groups tools by category in the sidebar', () => {
    window.location.hash = '#/tools/alpha';
    render(<App tools={fakeTools} />);
    const nav = screen.getByRole('navigation', { name: 'Tools' });
    expect(nav).toHaveTextContent('Data');
    expect(nav).toHaveTextContent('Text');
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '#/tools/alpha');
  });

  it('renders the active tool with its title and marks the link current', async () => {
    window.location.hash = '#/tools/alpha';
    render(<App tools={fakeTools} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument();
    expect(await screen.findByText('alpha body')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('aria-current', 'page');
  });

  it('redirects home to the first tool', async () => {
    render(<App tools={fakeTools} />);
    expect(await screen.findByText('alpha body')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/tools/alpha');
  });

  it('shows not found for unknown tools', () => {
    window.location.hash = '#/tools/missing';
    render(<App tools={fakeTools} />);
    expect(screen.getByRole('heading', { name: 'Tool not found' })).toBeInTheDocument();
  });

  it('contains a crashing tool without breaking the shell', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.location.hash = '#/tools/crashy';
    render(<App tools={fakeTools} />);
    expect(await screen.findByText('This tool crashed')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Tools' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app`
Expected: FAIL — cannot resolve `./theme`, `./ToolErrorBoundary`, `./App`.

- [ ] **Step 3: Implement theme**

`src/app/theme.ts`:
```ts
import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const KEY = 'qa-toolbox.theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(storage: Storage | undefined = defaultStorage()): ThemePreference {
  try {
    const value = storage?.getItem(KEY);
    return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  pref: ThemePreference,
  storage: Storage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(KEY, pref);
  } catch {
    // UI preference only — losing it is harmless.
  }
}

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return prefersDark ? 'dark' : 'light';
  return pref;
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(() => readThemePreference());

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(pref, media?.matches ?? false);
    };
    apply();
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [pref]);

  const update = (next: ThemePreference) => {
    writeThemePreference(next);
    setPref(next);
  };
  return [pref, update];
}
```

- [ ] **Step 4: Implement the shell components**

`src/app/ToolErrorBoundary.tsx`:
```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  toolName: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Console only — errors are never sent anywhere.
    console.error(`[qa-toolbox] ${this.props.toolName} crashed`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h2>This tool crashed</h2>
        <p>The rest of qa-toolbox still works. Input in this tool was lost.</p>
        <button type="button" onClick={this.reset}>
          Reload tool
        </button>
        <details>
          <summary>Error details</summary>
          <pre>{error.stack ?? error.message}</pre>
        </details>
      </div>
    );
  }
}
```

`src/app/ToolHost.tsx`:
```tsx
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { ToolDefinition } from '../tools/types';
import { ToolErrorBoundary } from './ToolErrorBoundary';

const lazyCache = new Map<string, LazyExoticComponent<ComponentType>>();

function lazyTool(tool: ToolDefinition): LazyExoticComponent<ComponentType> {
  let component = lazyCache.get(tool.id);
  if (!component) {
    component = lazy(tool.load);
    lazyCache.set(tool.id, component);
  }
  return component;
}

export function ToolHost({ tool }: { tool: ToolDefinition }) {
  const Tool = lazyTool(tool);
  return (
    <section className="tool" aria-labelledby="tool-title">
      <h1 id="tool-title" className="tool__title">
        {tool.name}
      </h1>
      <div className="tool__body">
        <ToolErrorBoundary key={tool.id} toolName={tool.name}>
          <Suspense fallback={<p role="status">Loading…</p>}>
            <Tool />
          </Suspense>
        </ToolErrorBoundary>
      </div>
    </section>
  );
}
```

`src/app/Sidebar.tsx`:
```tsx
import { CATEGORY_LABELS, CATEGORY_ORDER, type ToolDefinition } from '../tools/types';
import { toolHref } from './router';

export function Sidebar({ tools, activeId }: { tools: readonly ToolDefinition[]; activeId?: string }) {
  return (
    <nav className="sidebar" aria-label="Tools">
      {CATEGORY_ORDER.map((category) => {
        const inCategory = tools.filter((t) => t.category === category);
        if (inCategory.length === 0) return null;
        return (
          <div key={category} className="sidebar__group">
            <h2 className="sidebar__heading">{CATEGORY_LABELS[category]}</h2>
            <ul className="sidebar__list">
              {inCategory.map((t) => (
                <li key={t.id}>
                  <a
                    className="sidebar__link"
                    href={toolHref(t.id)}
                    title={t.description}
                    aria-current={t.id === activeId ? 'page' : undefined}
                  >
                    {t.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
```

`src/app/ThemeToggle.tsx`:
```tsx
import type { ThemePreference } from './theme';

export function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (p: ThemePreference) => void;
}) {
  return (
    <select aria-label="Theme" value={value} onChange={(e) => onChange(e.target.value as ThemePreference)}>
      <option value="system">System theme</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
```

`src/app/App.tsx`:
```tsx
import { useEffect } from 'react';
import type { ToolDefinition } from '../tools/types';
import { parseRoute, toolHref, useHashLocation } from './router';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { useThemePreference } from './theme';
import { ToolHost } from './ToolHost';

export function App({ tools }: { tools: readonly ToolDefinition[] }) {
  const route = parseRoute(useHashLocation());
  const [theme, setTheme] = useThemePreference();
  const firstToolId = tools[0]?.id;

  useEffect(() => {
    if (route.kind === 'home' && firstToolId) window.location.replace(toolHref(firstToolId));
  }, [route.kind, firstToolId]);

  const tool = route.kind === 'tool' ? tools.find((t) => t.id === route.toolId) : undefined;

  return (
    <div className="app">
      <header className="app__header">
        <a className="app__brand" href={firstToolId ? toolHref(firstToolId) : '#/'}>
          qa-toolbox
        </a>
        <ThemeToggle value={theme} onChange={setTheme} />
      </header>
      <Sidebar tools={tools} activeId={tool?.id} />
      <main className="main">
        {tool && <ToolHost tool={tool} />}
        {route.kind !== 'home' && !tool && (
          <div className="not-found">
            <h1>Tool not found</h1>
            <p>
              <a href="#/">Go to the first tool</a>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
```

`src/main.tsx` (replace the placeholder):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { tools } from './tools/registry';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App tools={tools} />
  </StrictMode>,
);
```

`src/app/styles.css`:
```css
:root {
  color-scheme: light;
  --bg: #ffffff;
  --bg-subtle: #f5f6f8;
  --bg-editor: #ffffff;
  --fg: #1d2129;
  --fg-muted: #5c6370;
  --border: #d9dde3;
  --accent: #2f6feb;
  --accent-fg: #ffffff;
  --danger: #c62828;
  --danger-bg: #fdecea;
  --ok: #2e7d32;
  --info-bg: #e8f0fe;
  --added: #2e7d32;
  --removed: #c62828;
  --changed: #b26a00;
  --moved: #6a1b9a;
  --font-ui: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --radius: 6px;
  --sidebar-width: 220px;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #16181d;
  --bg-subtle: #1e2128;
  --bg-editor: #1b1d23;
  --fg: #e3e6eb;
  --fg-muted: #9aa2ad;
  --border: #2f343d;
  --accent: #5b8def;
  --danger: #ef5350;
  --danger-bg: #3b1d1d;
  --ok: #66bb6a;
  --info-bg: #1c2a44;
  --added: #66bb6a;
  --removed: #ef5350;
  --changed: #ffb74d;
  --moved: #ba68c8;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--fg); font: 14px/1.4 var(--font-ui); }
.app { display: grid; grid-template-columns: var(--sidebar-width) 1fr; grid-template-rows: auto 1fr; height: 100%; }
.app__header { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-subtle); }
.app__brand { font-weight: 700; font-size: 16px; color: var(--fg); text-decoration: none; }
.sidebar { border-right: 1px solid var(--border); padding: 12px 8px; overflow-y: auto; background: var(--bg-subtle); }
.sidebar__group { margin: 0 0 12px; }
.sidebar__heading { margin: 0 8px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted); }
.sidebar__list { list-style: none; margin: 0; padding: 0; }
.sidebar__link { display: block; padding: 6px 8px; border-radius: var(--radius); color: var(--fg); text-decoration: none; }
.sidebar__link:hover { background: var(--bg); }
.sidebar__link[aria-current='page'] { background: var(--accent); color: var(--accent-fg); }
.main { min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.tool { display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 12px 16px; gap: 8px; }
.tool__title { margin: 0; font-size: 18px; }
.tool__body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.toolbar__spacer { flex: 1; }
button, select { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }
button[aria-pressed='true'], button[aria-selected='true'] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.banner { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 10px; border-radius: var(--radius); }
.banner--error { background: var(--danger-bg); color: var(--danger); }
.banner--info { background: var(--info-bg); }
.status-bar { font-size: 12px; color: var(--fg-muted); min-height: 18px; }
.status-bar--invalid { color: var(--danger); }
.status-bar--valid { color: var(--ok); }
.crash { padding: 16px; border: 1px solid var(--danger); border-radius: var(--radius); background: var(--danger-bg); }
.crash pre { white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; }
.not-found { padding: 24px; }
@media (max-width: 720px) {
  .app { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; }
  .sidebar { border-right: 0; border-bottom: 1px solid var(--border); }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/app && npm run typecheck && npm run lint`
Expected: all app tests PASS; no type or lint errors.

- [ ] **Step 6: Check it in the browser**

Run: `npm run dev`, open the printed URL.
Expected: redirects to `#/tools/json-editor`, sidebar shows "Data → JSON Editor", heading "JSON Editor", placeholder text; the theme select switches light/dark.

- [ ] **Step 7: Commit**

```bash
npm run format
git add -A
git commit -m "feat: add app shell with sidebar, theme, and per-tool error boundary"
```

---

### Task 5: Playwright — registry smoke and no-egress tests

**Files:**
- Create: `playwright.config.ts`, `e2e/support/app.ts`, `e2e/support/exercise.ts`, `e2e/registry-smoke.spec.ts`, `e2e/no-egress.spec.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: shell DOM contract from Task 4 (`nav[aria-label=Tools]` links, `h1` = tool name).
- Produces:
  - Playwright projects: `chromium`, `firefox`, `webkit` (functional), `perf` (Chromium, `perf.spec.ts` only), `container` (Chromium, `e2e/container/**`). Without `BASE_URL` the config builds and serves `vite preview` on port 4173; with `BASE_URL` it targets that server.
  - `ToolLink { name; href }`, `collectToolLinks(page): Promise<ToolLink[]>`, `visitTool(page, tool)`, `toolIdOf(tool): string`, `watchPageErrors(page): string[]` (live array) in `e2e/support/app.ts`.
  - `exerciseTool(page, toolId: string): Promise<void>` in `e2e/support/exercise.ts` — a per-tool "use it for real" hook; Tasks 14 and 16 add entries.
  - npm scripts `e2e`, `e2e:perf`, `e2e:container`.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium firefox webkit
```

- [ ] **Step 2: Add config, helpers, and scripts**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.BASE_URL;
const baseURL = externalBaseUrl ?? 'http://localhost:4173';
const notFunctional = ['**/perf.spec.ts', '**/container/**'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: notFunctional },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: notFunctional },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: notFunctional },
    { name: 'perf', use: { ...devices['Desktop Chrome'] }, testMatch: '**/perf.spec.ts' },
    { name: 'container', use: { ...devices['Desktop Chrome'] }, testMatch: '**/container/**/*.spec.ts' },
  ],
});
```

`e2e/support/app.ts`:
```ts
import { expect, type Page } from '@playwright/test';

export interface ToolLink {
  name: string;
  href: string;
}

/** Reads the tool list from the rendered sidebar, so tests follow the real registry. */
export async function collectToolLinks(page: Page): Promise<ToolLink[]> {
  await page.goto('/');
  const links = page.getByRole('navigation', { name: 'Tools' }).getByRole('link');
  await expect(links.first()).toBeVisible();
  return links.evaluateAll((els) =>
    els.map((el) => ({ name: el.textContent?.trim() ?? '', href: el.getAttribute('href') ?? '' })),
  );
}

export async function visitTool(page: Page, tool: ToolLink): Promise<void> {
  await page.goto(`/${tool.href}`);
  await expect(page.getByRole('heading', { level: 1, name: tool.name })).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

export function toolIdOf(tool: ToolLink): string {
  return tool.href.replace('#/tools/', '');
}

/** Collects uncaught page errors and console.error output. */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}
```

`e2e/support/exercise.ts`:
```ts
import type { Page } from '@playwright/test';

type Exercise = (page: Page) => Promise<void>;

/** Per-tool "use it for real" steps, used by the no-egress and CSP checks. */
const EXERCISES: Record<string, Exercise> = {};

export async function exerciseTool(page: Page, toolId: string): Promise<void> {
  await EXERCISES[toolId]?.(page);
}
```

Add to `package.json` `scripts`:
```json
"e2e": "playwright test --project=chromium --project=firefox --project=webkit",
"e2e:perf": "playwright test --project=perf",
"e2e:container": "playwright test --project=container"
```

- [ ] **Step 3: Write the smoke and no-egress specs**

`e2e/registry-smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { collectToolLinks, visitTool, watchPageErrors } from './support/app';

test('every registered tool loads without errors', async ({ page }) => {
  const errors = watchPageErrors(page);
  const tools = await collectToolLinks(page);
  expect(tools.length).toBeGreaterThan(0);
  for (const tool of tools) {
    expect(tool.name, `tool ${tool.href} has a name`).not.toBe('');
    await visitTool(page, tool);
  }
  expect(errors).toEqual([]);
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/#/tools/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Tool not found' })).toBeVisible();
});
```

`e2e/no-egress.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { collectToolLinks, toolIdOf, visitTool } from './support/app';
import { exerciseTool } from './support/exercise';

const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

test('no request leaves the app origin while using every tool', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const offenders: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (NETWORK_PROTOCOLS.has(url.protocol) && url.origin !== origin) offenders.push(req.url());
  });
  page.on('websocket', (ws) => offenders.push(`websocket: ${ws.url()}`));

  for (const tool of await collectToolLinks(page)) {
    await visitTool(page, tool);
    await exerciseTool(page, toolIdOf(tool));
    await page.waitForLoadState('networkidle');
  }
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 4: Run the suite on all browsers**

Run: `npm run e2e`
Expected: 3 tests × 3 browsers PASS.

- [ ] **Step 5: Prove the egress check bites**

Temporarily add `fetch('https://example.com').catch(() => {});` as the first line of the placeholder `JsonEditorTool` component body, then run `npx playwright test e2e/no-egress.spec.ts --project=chromium`.
Expected: FAIL listing `https://example.com/`. Remove the line and re-run. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "test: add Playwright registry smoke and no-egress checks"
```

---

### Task 6: Docker image, nginx, and container tests

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker/nginx.conf`, `docker/security-headers.conf`, `e2e/container/headers.spec.ts`

**Interfaces:**
- Consumes: `npm run build` output in `dist/`; `collectToolLinks`, `visitTool`, `toolIdOf`, `exerciseTool` (Task 5).
- Produces: an image serving on port 8080 with the Global Constraints CSP and headers; `GET /healthz` → `ok`; `docker/security-headers.conf` is the CSP source for nginx (Task 18 adds a drift test against `build/csp.ts`).

- [ ] **Step 1: Write the container spec**

`e2e/container/headers.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { collectToolLinks, toolIdOf, visitTool } from '../support/app';
import { exerciseTool } from '../support/exercise';

test.skip(!process.env.BASE_URL, 'Runs only against a running container: set BASE_URL');

test('index is served with security headers and no-cache', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const h = res.headers();
  const csp = h['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('unsafe-eval');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['cache-control']).toBe('no-cache');
});

test('healthz responds ok', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('ok');
});

test('hashed assets are immutable and keep the CSP', async ({ page, request }) => {
  await page.goto('/');
  const src = await page.locator('script[type="module"]').first().getAttribute('src');
  const res = await request.get(new URL(src!, page.url()).toString());
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('immutable');
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
});

test('no CSP violations while using every tool', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  for (const tool of await collectToolLinks(page)) {
    await visitTool(page, tool);
    await exerciseTool(page, toolIdOf(tool));
  }
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});
```

- [ ] **Step 2: Write the nginx config and Dockerfile**

`docker/security-headers.conf`:
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

`docker/nginx.conf`:
```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  server_tokens off;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  # add_header in a location replaces server-level headers, so every location re-includes them.
  include /etc/nginx/security-headers.conf;

  location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 "ok\n";
  }

  location /assets/ {
    include /etc/nginx/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
  }

  location = /index.html {
    include /etc/nginx/security-headers.conf;
    add_header Cache-Control "no-cache" always;
  }

  location / {
    try_files $uri $uri/ =404;
  }
}
```

`Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
# Build once on the runner's native arch; the static output is arch-independent.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
```

`.dockerignore`:
```
node_modules
dist
coverage
playwright-report
test-results
.git
.github
.idea
*.md
```

`docker-compose.yml`:
```yaml
services:
  qa-toolbox:
    build: .
    image: qa-toolbox:local
    ports:
      - '8080:8080'
    read_only: true
    tmpfs:
      - /tmp
```

- [ ] **Step 3: Build and run the container read-only**

```bash
docker compose up --build -d
curl -fsS http://localhost:8080/healthz
docker compose ps
```
Expected: `ok`; the service is `running` (becomes `healthy` after the first health check).

- [ ] **Step 4: Run the container spec**

Run: `BASE_URL=http://localhost:8080 npm run e2e:container`
Expected: 4 tests PASS.

Run: `npm run e2e:container` (no `BASE_URL`)
Expected: 4 tests SKIPPED.

- [ ] **Step 5: Stop and commit**

```bash
docker compose down
npm run format
git add -A
git commit -m "feat: add hardened nginx container with CSP and health check"
```

---

### Task 7: CI workflow, bundle budgets, Dependabot

**Files:**
- Create: `scripts/check-bundle.mjs`, `.github/workflows/ci.yml`, `.github/dependabot.yml`
- Modify: `package.json` (`check:bundle`, `verify`)

**Interfaces:**
- Consumes: `dist/.vite/manifest.json` (Task 1 `build.manifest`); npm scripts from Tasks 1 and 5; Docker setup from Task 6.
- Produces: `npm run check:bundle` enforcing the Global Constraints budgets by route (`ROUTE_BUDGETS` keyed by tool source path) and single-copy CodeMirror; CI jobs `verify`, `e2e` (matrix), `perf`, `container`.

- [ ] **Step 1: Write the bundle checker**

`scripts/check-bundle.mjs`:
```js
// Enforces intent.md §6.2 budgets using Vite's manifest. Run after `npm run build`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const ENTRY_BUDGET = 150 * KB;
const ROUTE_BUDGET = 600 * KB;
/** Tool source paths whose lazy route is budgeted. Missing keys are skipped (tool not built yet). */
const ROUTE_BUDGETS = {
  'src/tools/json-editor/JsonEditorTool.tsx': ROUTE_BUDGET,
  'src/tools/json-compare/JsonCompareTool.tsx': ROUTE_BUDGET,
};
const SINGLE_COPY = ['@codemirror/state', '@codemirror/view'];

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const failures = [];
const gz = (file) => (file.endsWith('.js') ? gzipSync(readFileSync(`dist/${file}`)).length : 0);
const fmt = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

function closure(key, seen = new Set()) {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return seen;
  seen.add(key);
  for (const dep of chunk.imports ?? []) closure(dep, seen);
  return seen;
}
const sizeOf = (keys) => [...keys].reduce((sum, k) => sum + gz(manifest[k].file), 0);

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const entryKeys = closure(entryKey);
const entrySize = sizeOf(entryKeys);
console.log(`entry: ${fmt(entrySize)} (budget ${fmt(ENTRY_BUDGET)})`);
if (entrySize > ENTRY_BUDGET) failures.push(`entry is ${fmt(entrySize)} > ${fmt(ENTRY_BUDGET)}`);

for (const [key, budget] of Object.entries(ROUTE_BUDGETS)) {
  if (!manifest[key]) {
    console.log(`${key}: not built yet, skipped`);
    continue;
  }
  const routeKeys = [...closure(key)].filter((k) => !entryKeys.has(k));
  const size = sizeOf(routeKeys);
  console.log(`${key}: ${fmt(size)} (budget ${fmt(budget)})`);
  if (size > budget) failures.push(`${key} route is ${fmt(size)} > ${fmt(budget)}`);
}

for (const pkg of SINGLE_COPY) {
  let out = '';
  try {
    out = execSync(`npm ls ${pkg} --all --parseable`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    out = err.stdout ?? ''; // npm ls exits 1 when the package is absent
  }
  const copies = new Set(out.split('\n').filter(Boolean));
  console.log(`${pkg}: ${copies.size} installed cop${copies.size === 1 ? 'y' : 'ies'}`);
  if (copies.size > 1) {
    failures.push(`${pkg} is installed ${copies.size} times:\n  ${[...copies].join('\n  ')}`);
  }
}

if (failures.length) {
  console.error(`\nBundle check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nBundle check passed.');
```

In `package.json` add `"check:bundle": "node scripts/check-bundle.mjs"` and change `verify` to:
```json
"verify": "npm run lint && npm run format:check && npm run typecheck && npm run coverage && npm run build && npm run check:bundle"
```

- [ ] **Step 2: Verify the checker passes, then fails on a tight budget**

Run: `npm run build && npm run check:bundle`
Expected: `entry: …KB (budget 150.0 KB)`, the JSON Editor route listed, JSON Compare "not built yet, skipped", `Bundle check passed.`

Temporarily set `ENTRY_BUDGET = 1 * KB`, re-run. Expected: exit 1 with `entry is … > 1.0 KB`. Restore `150 * KB`.

- [ ] **Step 3: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run verify
      - run: npm audit --omit=dev --audit-level=high
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: coverage, path: coverage/, if-no-files-found: ignore }

  e2e:
    needs: verify
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps ${{ matrix.browser }}
      - run: npx playwright test --project=${{ matrix.browser }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: 'playwright-report-${{ matrix.browser }}', path: playwright-report/ }

  perf:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:perf
        env: { PERF_MARGIN: '2' }

  container:
    needs: verify
    runs-on: ubuntu-latest
    env:
      TRIVY_IMAGE: aquasec/trivy:PIN_ME # Step 4 replaces this with <version>@sha256:<digest>
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t qa-toolbox:ci .
      - name: Scan image (HIGH/CRITICAL fail)
        run: >
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$TRIVY_IMAGE"
          image --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed qa-toolbox:ci
      - run: docker run -d --name qa-toolbox -p 8080:8080 --read-only --tmpfs /tmp qa-toolbox:ci
      - run: timeout 30 sh -c 'until curl -fsS http://localhost:8080/healthz; do sleep 1; done'
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:container
        env: { BASE_URL: 'http://localhost:8080' }
```

`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      dev-dependencies: { dependency-type: development }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
  - package-ecosystem: docker
    directory: /
    schedule: { interval: weekly }
```

- [ ] **Step 4: Pin third-party versions (supply-chain hygiene)**

Third-party actions and images have been compromised by tag rewrites, so pin to immutable references:
1. Find the current Trivy release at https://github.com/aquasecurity/trivy/releases, resolve its digest with `docker buildx imagetools inspect aquasec/trivy:<version> --format '{{json .Manifest.Digest}}'`, and set `TRIVY_IMAGE: aquasec/trivy:<version>@sha256:<digest>`. Confirm with `grep -c PIN_ME .github/workflows/ci.yml` → `0`.
2. For every `uses: owner/action@vN`, resolve the commit SHA with `gh api repos/<owner>/<action>/commits/vN --jq .sha` and rewrite it as `uses: owner/action@<sha> # vN`. Dependabot keeps SHAs current.

- [ ] **Step 5: Lint the workflows**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`
Expected: no output (no errors).

- [ ] **Step 6: Commit and get a CI run**

```bash
npm run format
git add -A
git commit -m "ci: add verify, e2e, perf, and container jobs with bundle budgets"
```
If a GitHub remote exists, push a branch and open a PR. Expected: all four jobs green. (The walking skeleton is complete. Ask the user before creating a remote or pushing.)

---

### Task 8: Spike — schema validator and editor under the strict CSP (throwaway)

**Question:** Does `vanilla-jsoneditor` + `@cfworker/json-schema` + the three allowed query languages run under the strict CSP (no `unsafe-eval`), with validation errors shown in the editor?

**Files:**
- Create (kept): `docs/decisions/0001-schema-validator.md`
- Throwaway (on branch `spike/schema-validator`, deleted afterwards): changes to `src/tools/json-editor/JsonEditorTool.tsx`, `package.json`, `package-lock.json`.

**Interfaces:**
- Consumes: container from Task 6.
- Produces: an ADR recording PASS (proceed with `@cfworker/json-schema`) or FAIL (switch to Ajv — Step 5).

- [ ] **Step 1: Branch and install**

```bash
git switch -c spike/schema-validator
npm install vanilla-jsoneditor @cfworker/json-schema
```

- [ ] **Step 2: Replace the placeholder tool with a raw editor mount**

`src/tools/json-editor/JsonEditorTool.tsx` (spike only — it intentionally breaks the architecture rule; that's fine on this branch):
```tsx
import { Validator as SchemaEngine } from '@cfworker/json-schema';
import { useEffect, useRef } from 'react';
import {
  createJSONEditor,
  jmespathQueryLanguage,
  jsonpathQueryLanguage,
  jsonQueryLanguage,
  ValidationSeverity,
  type Validator,
} from 'vanilla-jsoneditor';

const engine = new SchemaEngine(
  { type: 'object', properties: { age: { type: 'number' } } },
  '2020-12',
  false,
);
const validator: Validator = (json) =>
  engine.validate(json).errors.map((e) => ({
    path: e.instanceLocation.replace(/^#\/?/, '').split('/').filter(Boolean),
    message: e.error,
    severity: ValidationSeverity.error,
  }));

export default function JsonEditorTool() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = createJSONEditor({
      target: ref.current!,
      props: {
        content: { text: '{"age": "not a number", "items": [{"id": 1}, {"id": 2}]}' },
        validator,
        queryLanguages: [jsonQueryLanguage, jmespathQueryLanguage, jsonpathQueryLanguage],
      },
    });
    return () => void editor.destroy();
  }, []);
  return <div ref={ref} style={{ height: '70vh' }} />;
}
```

- [ ] **Step 3: Run in the container and check each criterion**

```bash
docker compose up --build -d
```
Open http://localhost:8080/#/tools/json-editor in Chrome with the DevTools Console open. Check and note each:
1. A validation error for `age` shows in text mode and in tree mode.
2. Switching text / tree / table works.
3. Transform (funnel icon) → for each of JSONQuery, JMESPath, JSONPath, run a query selecting `items` → the preview shows the array.
4. The console shows **no** `Refused to …` / "Content Security Policy" messages.
5. `BASE_URL=http://localhost:8080 npm run e2e:container` passes.

PASS = all five hold.

- [ ] **Step 4: Discard the spike and write the ADR on main**

```bash
docker compose down
git stash -u
git switch main
git branch -D spike/schema-validator
git stash drop
npm ci
```

`docs/decisions/0001-schema-validator.md` — fill in what you observed and keep only the Decision line that matches:
```markdown
# 0001 — JSON Schema validator under a strict CSP

- Date: <YYYY-MM-DD>
- Status: Accepted

## Context
qa-toolbox serves a CSP without `unsafe-eval` (intent.md §6.3). Ajv compiles schemas with `new Function`, which that CSP blocks.

## Spike
vanilla-jsoneditor 3 + @cfworker/json-schema 4 + JSONQuery/JMESPath/JSONPath, served by the production nginx container.

| Criterion | Result |
|---|---|
| Validation errors shown in text and tree mode | PASS/FAIL |
| text/tree/table modes work | PASS/FAIL |
| Transform works for JSONQuery, JMESPath, JSONPath | PASS/FAIL |
| No CSP violations in console | PASS/FAIL |
| Container e2e passes | PASS/FAIL |

## Decision
- (PASS) Use @cfworker/json-schema; the CSP stays free of `unsafe-eval`.
- (FAIL) Use Ajv via `createAjvValidator` and add `'unsafe-eval'` to `script-src` (plan Task 8 Step 5 lists the changes).
```

- [ ] **Step 5: Only if the spike FAILED — apply the fallback to this plan before continuing**

1. Task 13: implement `createSchemaValidator` with `createAjvValidator({ schema })` from `vanilla-jsoneditor` (keep the signature and the tests for empty / invalid-JSON / non-object schemas; drop the cfworker-specific `toValidationErrors`, `pointerToPath`, `detectDraft` and their tests).
2. `docker/security-headers.conf` and Task 18's `build/csp.ts`: `script-src 'self' 'unsafe-eval'`.
3. `e2e/container/headers.spec.ts`: delete the `not.toContain('unsafe-eval')` assertion.
4. Global Constraints: update the CSP and "No code generation" lines. Tell the user, since this changes intent.md §6.3.

- [ ] **Step 6: Commit the ADR**

```bash
git add docs/decisions/0001-schema-validator.md
git commit -m "docs: record schema validator spike outcome (ADR 0001)"
```

---

### Task 9: Text utilities and the JSON format adapter

**Files:**
- Create: `src/core/text.ts`, `src/core/formats/types.ts`, `src/core/formats/errors.ts`, `src/core/formats/json.ts`
- Test: `src/core/text.test.ts`, `src/core/formats/errors.test.ts`, `src/core/formats/json.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/core/text.ts`: `stripBom(text): string`, `offsetToLineColumn(text, offset): { line: number; column: number }` (1-based), `utf8ByteLength(text): number`, `formatBytes(bytes): string`.
  - `src/core/formats/types.ts`: `FormatId = 'json'`, `ParseError { message; line?; column? }`, `ParseResult`, `FormatAdapter<Opts>` (intent.md §3.2 without the optional `detect`).
  - `src/core/formats/errors.ts`: `describeParseError(error: ParseError): string` → `"<message> (line L, column C)"` or `"<message>"`.
  - `src/core/formats/json.ts`: `JsonIndent = 2 | 4 | '\t' | 0`, `JsonStringifyOptions { indent?; sortKeys? }`, `jsonAdapter: FormatAdapter<JsonStringifyOptions>`, `RepairResult = { ok: true; text } | { ok: false; error: ParseError }`, `repairJson(text): RepairResult`, `sortKeysDeep(value): unknown`, `countNodes(value): number`, `toPlainValue(value, numbers?: 'exact' | 'approximate'): unknown`, `losslessJsonParser: { parse; stringify }`.
  - Parsed values contain `LosslessNumber` instances for numbers. `toPlainValue(v)` converts them to `number` when safe, `bigint` for unsafe integers, or the original numeric string otherwise; with `'approximate'` always `number`.

- [ ] **Step 1: Install**

```bash
npm install lossless-json jsonrepair
```

- [ ] **Step 2: Write the failing tests**

`src/core/text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatBytes, offsetToLineColumn, stripBom, utf8ByteLength } from './text';

describe('stripBom', () => {
  it('removes a leading BOM only', () => {
    expect(stripBom('﻿{"a":1}')).toBe('{"a":1}');
    expect(stripBom('{"a":"﻿"}')).toBe('{"a":"﻿"}');
  });
});

describe('offsetToLineColumn', () => {
  const text = '{\n  "a": 1\n  "b": 2\n}';
  it.each([
    [0, { line: 1, column: 1 }],
    [2, { line: 2, column: 1 }],
    [13, { line: 3, column: 3 }],
    [999, { line: 4, column: 2 }],
    [-5, { line: 1, column: 1 }],
  ])('offset %i', (offset, expected) => {
    expect(offsetToLineColumn(text, offset)).toEqual(expected);
  });
});

describe('utf8ByteLength', () => {
  it('counts multi-byte characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [20 * 1024 * 1024, '20 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('%i bytes', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
```

`src/core/formats/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeParseError } from './errors';

describe('describeParseError', () => {
  it('adds the position when known', () => {
    expect(describeParseError({ message: 'Bad', line: 3, column: 7 })).toBe('Bad (line 3, column 7)');
    expect(describeParseError({ message: 'Bad' })).toBe('Bad');
  });
});
```

`src/core/formats/json.test.ts`:
```ts
import { isLosslessNumber } from 'lossless-json';
import { describe, expect, it, vi } from 'vitest';
import { countNodes, jsonAdapter, repairJson, sortKeysDeep, toPlainValue } from './json';

const parseValue = (text: string) => {
  const r = jsonAdapter.parse(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('jsonAdapter.parse', () => {
  it('parses objects, arrays, and top-level scalars', () => {
    expect(jsonAdapter.parse('{"a":[1,2]}').ok).toBe(true);
    expect(toPlainValue(parseValue('"hello"'))).toBe('hello');
    expect(toPlainValue(parseValue('42'))).toBe(42);
    expect(parseValue('null')).toBeNull();
  });

  it('accepts a leading BOM (Review Focus 2)', () => {
    expect(jsonAdapter.parse('﻿{"a":1}').ok).toBe(true);
  });

  it('reports empty input as an error at 1:1', () => {
    expect(jsonAdapter.parse('   \n')).toEqual({
      ok: false,
      error: { message: 'Document is empty', line: 1, column: 1 },
    });
  });

  it('reports the line and column of a syntax error', () => {
    const r = jsonAdapter.parse('{\n  "a": 1\n  "b": 2\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject({ line: 3, column: 3 });
      expect(r.error.message).not.toBe('');
    }
  });

  it('reports a trailing comma', () => {
    const r = jsonAdapter.parse('{"a":1,}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ line: 1, column: 8 });
  });

  it('rejects duplicate keys with different values', () => {
    const r = jsonAdapter.parse('{"a":1,"a":2}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Duplicate key/);
  });

  it('never throws', () => {
    for (const bad of ['{', ']', '{"a":}', 'nul', '"\\x"', '\u0000']) {
      expect(() => jsonAdapter.parse(bad)).not.toThrow();
      expect(jsonAdapter.parse(bad).ok).toBe(false);
    }
  });
});

describe('jsonAdapter.stringify', () => {
  const value = () => parseValue('{"b":1,"a":[1,2]}');

  it('formats with 2 spaces by default, 4 spaces, tabs, or minified', () => {
    expect(jsonAdapter.stringify(value())).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(jsonAdapter.stringify(value(), { indent: 4 })).toContain('\n    "b": 1');
    expect(jsonAdapter.stringify(value(), { indent: '\t' })).toContain('\n\t"b": 1');
    expect(jsonAdapter.stringify(value(), { indent: 0 })).toBe('{"b":1,"a":[1,2]}');
  });

  it('sorts keys recursively when asked', () => {
    expect(
      jsonAdapter.stringify(parseValue('{"b":{"d":1,"c":2},"a":0}'), { indent: 0, sortKeys: true }),
    ).toBe('{"a":0,"b":{"c":2,"d":1}}');
  });

  it('preserves big integers and high-precision decimals exactly (Review Focus 1)', () => {
    const text = '{"id":12345678901234567890,"pi":3.141592653589793238462643383279}';
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0 })).toBe(text);
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0, sortKeys: true })).toBe(text);
  });

  it('preserves unicode, escapes, and a "__proto__" key', () => {
    const text = '{"__proto__":1,"emoji":"😀","esc":"line\\nbreak \\"q\\""}';
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0 })).toBe(text);
    expect(jsonAdapter.stringify(parseValue(text), { indent: 0, sortKeys: true })).toBe(text);
  });
});

describe('repairJson', () => {
  it('repairs common breakage', () => {
    expect(repairJson("{'a': 1, b: [1,2,],}")).toEqual({ ok: true, text: '{"a": 1, "b": [1,2]}' });
  });

  it('returns a positioned error when repair is impossible', async () => {
    vi.resetModules();
    vi.doMock('jsonrepair', async () => {
      const actual = await vi.importActual<typeof import('jsonrepair')>('jsonrepair');
      return {
        ...actual,
        jsonrepair: () => {
          throw new actual.JSONRepairError('Colon expected', 4);
        },
      };
    });
    const { repairJson: mockedRepair } = await import('./json');
    expect(mockedRepair('{"a" 1}')).toEqual({
      ok: false,
      error: { message: 'Colon expected at position 4', line: 1, column: 5 },
    });
    vi.doUnmock('jsonrepair');
  });
});

describe('sortKeysDeep', () => {
  it('keeps arrays in order and leaves numbers intact', () => {
    const sorted = sortKeysDeep(parseValue('[{"b":1,"a":2},3]')) as [Record<string, unknown>, unknown];
    expect(Object.keys(sorted[0])).toEqual(['a', 'b']);
    expect(isLosslessNumber(sorted[1])).toBe(true);
  });
});

describe('countNodes', () => {
  it('counts every value including containers', () => {
    expect(countNodes(parseValue('{"a":[1,2,{"b":null}]}'))).toBe(6);
    expect(countNodes(parseValue('1'))).toBe(1);
  });
});

describe('toPlainValue', () => {
  it('converts numbers exactly or approximately', () => {
    const v = parseValue('[1.5, 12345678901234567890, 1e400]');
    expect(toPlainValue(v)).toEqual([1.5, 12345678901234567890n, '1e400']);
    expect(toPlainValue(v, 'approximate')).toEqual([1.5, 12345678901234567890, Infinity]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/core`
Expected: FAIL — cannot resolve `./text`, `./errors`, `./json`.

- [ ] **Step 4: Implement**

`src/core/text.ts`:
```ts
const BOM = 0xfeff;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === BOM ? text.slice(1) : text;
}

/** 1-based line and column of a 0-based character offset (clamped to the text). */
export function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const end = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
```

`src/core/formats/types.ts`:
```ts
export type FormatId = 'json'; // grows: 'xml' | 'csv' | 'yaml' | 'toml'

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: ParseError };

export interface FormatAdapter<Opts = unknown> {
  id: FormatId;
  label: string;
  /** Never throws. */
  parse(text: string): ParseResult;
  stringify(value: unknown, opts?: Opts): string;
}
```

`src/core/formats/errors.ts`:
```ts
import type { ParseError } from './types';

export function describeParseError(error: ParseError): string {
  return error.line
    ? `${error.message} (line ${error.line}, column ${error.column ?? 1})`
    : error.message;
}
```

`src/core/formats/json.ts`:
```ts
import { jsonrepair } from 'jsonrepair';
import {
  isInteger,
  isLosslessNumber,
  isSafeNumber,
  parse as losslessParse,
  stringify as losslessStringify,
} from 'lossless-json';
import { offsetToLineColumn, stripBom } from '../text';
import type { FormatAdapter, ParseError } from './types';

export type JsonIndent = 2 | 4 | '\t' | 0;
export interface JsonStringifyOptions {
  indent?: JsonIndent;
  sortKeys?: boolean;
}
export type RepairResult = { ok: true; text: string } | { ok: false; error: ParseError };

/** lossless-json keeps numbers as LosslessNumber so big integers and long decimals survive. */
export const losslessJsonParser = { parse: losslessParse, stringify: losslessStringify };

// lossless-json and jsonrepair both end their messages with "at position N" (0-based).
const POSITION = /position (\d+)/;

function toParseError(source: string, err: unknown): ParseError {
  const message = err instanceof Error ? err.message : String(err);
  const match = POSITION.exec(message);
  return match ? { message, ...offsetToLineColumn(source, Number(match[1])) } : { message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isLosslessNumber(value)
  );
}

/** Assigns without triggering the __proto__ setter, so a "__proto__" key is kept as data. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) setOwn(out, key, sortKeysDeep(value[key]));
  return out;
}

export function countNodes(value: unknown): number {
  let count = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    count++;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else if (isPlainObject(current)) {
      for (const key of Object.keys(current)) stack.push(current[key]);
    }
  }
  return count;
}

export function toPlainValue(value: unknown, numbers: 'exact' | 'approximate' = 'exact'): unknown {
  if (isLosslessNumber(value)) {
    const literal = value.value;
    if (numbers === 'approximate' || isSafeNumber(literal)) return Number(literal);
    return isInteger(literal) ? BigInt(literal) : literal;
  }
  if (Array.isArray(value)) return value.map((item) => toPlainValue(item, numbers));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) setOwn(out, key, toPlainValue(value[key], numbers));
  return out;
}

export const jsonAdapter: FormatAdapter<JsonStringifyOptions> = {
  id: 'json',
  label: 'JSON',
  parse(text) {
    const source = stripBom(text);
    if (source.trim() === '') {
      return { ok: false, error: { message: 'Document is empty', line: 1, column: 1 } };
    }
    try {
      return { ok: true, value: losslessParse(source) };
    } catch (err) {
      return { ok: false, error: toParseError(source, err) };
    }
  },
  stringify(value, opts = {}) {
    const { indent = 2, sortKeys = false } = opts;
    const input = sortKeys ? sortKeysDeep(value) : value;
    return losslessStringify(input, null, indent === 0 ? undefined : indent) ?? '';
  },
};

export function repairJson(text: string): RepairResult {
  const source = stripBom(text);
  try {
    return { ok: true, text: jsonrepair(source) };
  } catch (err) {
    return { ok: false, error: toParseError(source, err) };
  }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/core`
Expected: PASS. If `repairJson("{'a': 1, b: [1,2,],}")` differs only in whitespace, print the actual output; the keys must be quoted and the trailing commas gone. **Stop and ask the user before editing the test** (see Global Constraints — test changes need their confirmation); show the actual vs expected output.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(core): add lossless JSON format adapter and text utilities"
```

---

### Task 10: I/O utilities — clipboard, download, file reading, drop zone

**Files:**
- Create: `src/core/io/clipboard.ts`, `src/core/io/download.ts`, `src/core/io/file.ts`, `src/core/io/useFileDrop.ts`
- Test: `src/core/io/clipboard.test.ts`, `src/core/io/download.test.ts`, `src/core/io/file.test.ts`, `src/core/io/useFileDrop.test.ts`

**Interfaces:**
- Consumes: `stripBom`, `formatBytes` (Task 9).
- Produces:
  - `copyToClipboard(text): Promise<void>` — throws `ClipboardUnavailableError` (message "Clipboard is unavailable here. Select the text and copy it manually.") when neither the async clipboard nor `execCommand('copy')` works.
  - `downloadText(filename, text, mime = 'application/json'): void`.
  - `readFileAsText(file: Blob, maxBytes = DEFAULT_MAX_FILE_BYTES): Promise<string>` — strips the BOM; throws `FileReadError` for too-large or binary files. `DEFAULT_MAX_FILE_BYTES = 200 MiB`.
  - `useFileDrop(onFile: (file: File) => void): { isOver: boolean; dropProps: { onDragOverCapture; onDragLeave; onDropCapture } }` — capture-phase handlers so they win over CodeMirror's own drop handling.

- [ ] **Step 1: Write the failing tests**

`src/core/io/clipboard.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipboardUnavailableError, copyToClipboard } from './clipboard';

function setContext(secure: boolean, writeText?: (t: string) => Promise<void>) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}
const setExecCommand = (fn: unknown) =>
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true });

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setExecCommand(undefined);
  });

  it('uses the async clipboard in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setContext(true, writeText);
    await copyToClipboard('hi');
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('falls back to execCommand over plain http on a LAN IP (Review Focus 3)', async () => {
    setContext(false);
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);
    await copyToClipboard('hi');
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('throws a helpful error when no clipboard path works', async () => {
    setContext(false);
    setExecCommand(vi.fn().mockReturnValue(false));
    await expect(copyToClipboard('hi')).rejects.toBeInstanceOf(ClipboardUnavailableError);
    setExecCommand(undefined);
    await expect(copyToClipboard('hi')).rejects.toThrow('Clipboard is unavailable here');
  });
});
```

`src/core/io/download.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';

describe('downloadText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clicks a temporary link to a blob URL and revokes it', () => {
    vi.useFakeTimers();
    const create = vi.fn().mockReturnValue('blob:qa-toolbox/1');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('data.json');
        expect(this.href).toBe('blob:qa-toolbox/1');
      });

    downloadText('data.json', '{"a":1}');

    expect(click).toHaveBeenCalledOnce();
    expect((create.mock.calls[0]![0] as Blob).type).toBe('application/json;charset=utf-8');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:qa-toolbox/1');
  });
});
```

`src/core/io/file.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FileReadError, readFileAsText } from './file';

describe('readFileAsText', () => {
  it('reads text and strips a BOM (Review Focus 2)', async () => {
    expect(await readFileAsText(new Blob(['﻿{"a":1}']))).toBe('{"a":1}');
  });

  it('rejects files over the size limit', async () => {
    await expect(readFileAsText(new Blob(['12345']), 4)).rejects.toThrow(
      'File is too large (5 B). The limit is 4 B.',
    );
  });

  it('rejects binary files (Review Focus 2)', async () => {
    const binary = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x1a])]);
    await expect(readFileAsText(binary)).rejects.toBeInstanceOf(FileReadError);
    await expect(readFileAsText(binary)).rejects.toThrow('binary file');
  });
});
```

`src/core/io/useFileDrop.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFileDrop } from './useFileDrop';

const dragEvent = (types: string[], files: File[] = []) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { types, files },
  }) as unknown as DragEvent;

describe('useFileDrop', () => {
  it('highlights while dragging files and delivers the first dropped file', () => {
    const onFile = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFile));
    const over = dragEvent(['Files']);
    act(() => result.current.dropProps.onDragOverCapture(over));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(result.current.isOver).toBe(true);

    const file = new File(['{}'], 'a.json');
    const drop = dragEvent(['Files'], [file]);
    act(() => result.current.dropProps.onDropCapture(drop));
    expect(drop.stopPropagation).toHaveBeenCalled();
    expect(onFile).toHaveBeenCalledWith(file);
    expect(result.current.isOver).toBe(false);
  });

  it('ignores drags that carry no files', () => {
    const onFile = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFile));
    const textDrag = dragEvent(['text/plain']);
    act(() => result.current.dropProps.onDragOverCapture(textDrag));
    expect(textDrag.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.dropProps.onDropCapture(textDrag));
    expect(onFile).not.toHaveBeenCalled();
    act(() => result.current.dropProps.onDragLeave());
    expect(result.current.isOver).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/core/io`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/core/io/clipboard.ts`:
```ts
export class ClipboardUnavailableError extends Error {
  constructor() {
    super('Clipboard is unavailable here. Select the text and copy it manually.');
    this.name = 'ClipboardUnavailableError';
  }
}

/** navigator.clipboard only exists in secure contexts; http://<LAN-IP> needs the execCommand fallback. */
export async function copyToClipboard(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document.execCommand !== 'function') throw new ClipboardUnavailableError();
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new ClipboardUnavailableError();
  } finally {
    textarea.remove();
  }
}
```

`src/core/io/download.ts`:
```ts
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

`src/core/io/file.ts`:
```ts
import { formatBytes, stripBom } from '../text';

export const DEFAULT_MAX_FILE_BYTES = 200 * 1024 * 1024;
const BINARY_SNIFF_CHARS = 8192;

export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReadError';
  }
}

export async function readFileAsText(file: Blob, maxBytes = DEFAULT_MAX_FILE_BYTES): Promise<string> {
  if (file.size > maxBytes) {
    throw new FileReadError(
      `File is too large (${formatBytes(file.size)}). The limit is ${formatBytes(maxBytes)}.`,
    );
  }
  const text = await file.text();
  if (text.slice(0, BINARY_SNIFF_CHARS).includes('\u0000')) {
    throw new FileReadError('This looks like a binary file, not text.');
  }
  return stripBom(text);
}
```

`src/core/io/useFileDrop.ts`:
```ts
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function useFileDrop(onFile: (file: File) => void) {
  const [isOver, setIsOver] = useState(false);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });

  const dropProps = useMemo(
    () => ({
      onDragOverCapture: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setIsOver(true);
      },
      onDragLeave: () => setIsOver(false),
      onDropCapture: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFileRef.current(file);
      },
    }),
    [],
  );
  return { isOver, dropProps };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/core/io`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(core): add clipboard, download, file reading, and drop zone helpers"
```

---

### Task 11: Worker runner and async React hooks

**Files:**
- Create: `src/core/worker/protocol.ts`, `src/core/worker/runInWorker.ts`, `src/core/worker/expose.ts`, `src/core/react/useDebouncedValue.ts`, `src/core/react/useAsyncValue.ts`
- Test: `src/core/worker/runInWorker.test.ts`, `src/core/worker/expose.test.ts`, `src/core/react/useDebouncedValue.test.ts`, `src/core/react/useAsyncValue.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WorkerResponse<O> = { ok: true; result: O } | { ok: false; error: string }`.
  - `WORKER_THRESHOLD_CHARS = 1_000_000`.
  - `runInWorker<I, O>(createWorker: () => Worker, input: I, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<O>` — one worker per call, always terminated; rejects with `WorkerTimeoutError` (default 30 s), an `AbortError` `DOMException`, or `Error(message)` from the worker.
  - `isAbortError(e: unknown): boolean`.
  - `WorkerScope`, `exposeWorker<I, O>(fn: (input: I) => O | Promise<O>, scope?: WorkerScope): void` — call at the top of a `*.worker.ts`.
  - `useDebouncedValue<T>(value: T, delayMs: number): T`.
  - `AsyncState<T> = { status: 'pending' } | { status: 'done'; value: T } | { status: 'error'; error: Error }`; `useAsyncValue<I, O>(input: I, compute: (input: I, signal: AbortSignal) => Promise<O>): AsyncState<O>` — `compute` must be a stable (module-level) function; keeps the previous `done` value while recomputing; aborts stale runs.

- [ ] **Step 1: Write the failing tests**

`src/core/worker/runInWorker.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortError, runInWorker, WorkerTimeoutError } from './runInWorker';

type Reply = (input: unknown) => unknown;
const SILENCE = Symbol('silence');
const CRASH = Symbol('crash');

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private reply: Reply) {}
  postMessage(input: unknown) {
    setTimeout(() => {
      const r = this.reply(input);
      if (r === SILENCE) return;
      if (r === CRASH) {
        this.onerror?.({ message: 'worker exploded', preventDefault() {} } as ErrorEvent);
        return;
      }
      this.onmessage?.({ data: r } as MessageEvent);
    }, 10);
  }
  terminate() {
    this.terminated = true;
  }
}

const spawn = (reply: Reply) => {
  const worker = new FakeWorker(reply);
  return { worker, create: () => worker as unknown as Worker };
};

describe('runInWorker', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves the result and terminates the worker', async () => {
    const { worker, create } = spawn((n) => ({ ok: true, result: (n as number) * 2 }));
    await expect(runInWorker<number, number>(create, 21)).resolves.toBe(42);
    expect(worker.terminated).toBe(true);
  });

  it('rejects with the worker error message', async () => {
    const { create } = spawn(() => ({ ok: false, error: 'bad input' }));
    await expect(runInWorker(create, 1)).rejects.toThrow('bad input');
  });

  it('rejects when the worker crashes', async () => {
    const { worker, create } = spawn(() => CRASH);
    await expect(runInWorker(create, 1)).rejects.toThrow('worker exploded');
    expect(worker.terminated).toBe(true);
  });

  it('times out', async () => {
    vi.useFakeTimers();
    const { worker, create } = spawn(() => SILENCE);
    const promise = runInWorker(create, 1, { timeoutMs: 1000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(WorkerTimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(worker.terminated).toBe(true);
  });

  it('aborts during the run, and refuses to start when already aborted', async () => {
    const controller = new AbortController();
    const { worker, create } = spawn(() => SILENCE);
    const promise = runInWorker(create, 1, { signal: controller.signal });
    controller.abort();
    expect(isAbortError(await promise.catch((e: unknown) => e))).toBe(true);
    expect(worker.terminated).toBe(true);

    const neverCreated = vi.fn();
    const already = await runInWorker(neverCreated, 1, { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    expect(isAbortError(already)).toBe(true);
    expect(neverCreated).not.toHaveBeenCalled();
  });
});
```

`src/core/worker/expose.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { exposeWorker, type WorkerScope } from './expose';

const scope = () => {
  const posted: unknown[] = [];
  const s: WorkerScope = { onmessage: null, postMessage: (m: unknown) => void posted.push(m) };
  return { s, posted };
};

describe('exposeWorker', () => {
  it('posts the result of async functions', async () => {
    const { s, posted } = scope();
    exposeWorker((n: number) => Promise.resolve(n + 1), s);
    await s.onmessage!({ data: 1 } as MessageEvent);
    expect(posted).toEqual([{ ok: true, result: 2 }]);
  });

  it('posts thrown errors as messages', async () => {
    const { s, posted } = scope();
    exposeWorker(() => {
      throw new Error('nope');
    }, s);
    await s.onmessage!({ data: null } as MessageEvent);
    expect(posted).toEqual([{ ok: false, error: 'nope' }]);
  });
});
```

`src/core/react/useDebouncedValue.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  it('emits the latest value after the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    rerender({ v: 'c' });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('c');
    vi.useRealTimers();
  });
});
```

`src/core/react/useAsyncValue.test.ts`:
```ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAsyncValue } from './useAsyncValue';

const double = async (n: number) => n * 2;
const fail = async (_n: number): Promise<number> => {
  throw new Error('broken');
};
const slowEcho = (n: number, signal: AbortSignal) =>
  new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => resolve(n), n);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

describe('useAsyncValue', () => {
  it('goes from pending to done', async () => {
    const { result } = renderHook(() => useAsyncValue(2, double));
    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current).toEqual({ status: 'done', value: 4 }));
  });

  it('reports errors', async () => {
    const { result } = renderHook(() => useAsyncValue(0, fail));
    await waitFor(() => expect(result.current.status).toBe('error'));
    if (result.current.status === 'error') expect(result.current.error.message).toBe('broken');
  });

  it('drops stale results and keeps the previous value while recomputing', async () => {
    const { result, rerender } = renderHook(({ n }) => useAsyncValue(n, slowEcho), {
      initialProps: { n: 5 },
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'done', value: 5 }));
    rerender({ n: 60 });
    expect(result.current).toEqual({ status: 'done', value: 5 });
    rerender({ n: 10 });
    await waitFor(() => expect(result.current).toEqual({ status: 'done', value: 10 }));
    await new Promise((r) => setTimeout(r, 80));
    expect(result.current).toEqual({ status: 'done', value: 10 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/core/worker src/core/react`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/core/worker/protocol.ts`:
```ts
export type WorkerResponse<O> = { ok: true; result: O } | { ok: false; error: string };
```

`src/core/worker/runInWorker.ts`:
```ts
import type { WorkerResponse } from './protocol';

/** Inputs above this size are processed off the main thread. */
export const WORKER_THRESHOLD_CHARS = 1_000_000;

export interface RunInWorkerOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class WorkerTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms / 1000}s`);
    this.name = 'WorkerTimeoutError';
  }
}

const abortError = () => new DOMException('Aborted', 'AbortError');

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function runInWorker<I, O>(
  createWorker: () => Worker,
  input: I,
  { timeoutMs = 30_000, signal }: RunInWorkerOptions = {},
): Promise<O> {
  return new Promise<O>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const worker = createWorker();
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      settle();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timer = setTimeout(
      () => finish(() => reject(new WorkerTimeoutError(timeoutMs))),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerResponse<O>>) => {
      const data = event.data;
      finish(() => (data.ok ? resolve(data.result) : reject(new Error(data.error))));
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || 'Worker failed')));
    };
    worker.postMessage(input);
  });
}
```

`src/core/worker/expose.ts`:
```ts
import type { WorkerResponse } from './protocol';

export interface WorkerScope {
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null;
  postMessage(message: unknown): void;
}

export function exposeWorker<I, O>(
  fn: (input: I) => O | Promise<O>,
  scope: WorkerScope = self as unknown as WorkerScope,
): void {
  scope.onmessage = async (event: MessageEvent<I>) => {
    let response: WorkerResponse<O>;
    try {
      response = { ok: true, result: await fn(event.data) };
    } catch (err) {
      response = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    scope.postMessage(response);
  };
}
```

`src/core/react/useDebouncedValue.ts`:
```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

`src/core/react/useAsyncValue.ts`:
```ts
import { useEffect, useState } from 'react';
import { isAbortError } from '../worker/runInWorker';

export type AsyncState<T> =
  | { status: 'pending' }
  | { status: 'done'; value: T }
  | { status: 'error'; error: Error };

/** `compute` must be stable (defined at module level), or every render restarts it. */
export function useAsyncValue<I, O>(
  input: I,
  compute: (input: I, signal: AbortSignal) => Promise<O>,
): AsyncState<O> {
  const [state, setState] = useState<AsyncState<O>>({ status: 'pending' });

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'done' ? prev : { status: 'pending' }));
    compute(input, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ status: 'done', value });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );
    return () => controller.abort();
  }, [input, compute]);

  return state;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/core/worker src/core/react`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(core): add worker runner and async React hooks"
```

---

### Task 12: `<CodeEditor>` (CodeMirror 6)

**Files:**
- Create: `src/core/theme/useIsDarkTheme.ts`, `src/core/editor/theme.ts`, `src/core/editor/diagnostics.ts`, `src/core/editor/CodeEditor.tsx`, `src/core/editor/code-editor.css`
- Modify: `src/test/setup.ts` (jsdom polyfills for CodeMirror)
- Test: `src/core/theme/useIsDarkTheme.test.ts`, `src/core/editor/theme.test.ts`, `src/core/editor/diagnostics.test.ts`, `src/core/editor/CodeEditor.test.tsx`

**Interfaces:**
- Consumes: `ParseError` (Task 9); the `data-theme` attribute contract (Task 4).
- Produces:
  - `useIsDarkTheme(): boolean`.
  - `editorTheme(dark: boolean): Extension` (shared by CodeEditor and TextDiffView).
  - `errorsToDiagnostics(doc: Text, errors: readonly ParseError[]): Diagnostic[]`.
  - `<CodeEditor value onChange? language?: 'json' | 'text' readOnly? errors? ariaLabel testId? ref?: Ref<CodeEditorHandle>>`; `CodeEditorHandle { scrollToLine(line: number): void; focus(): void }`. The editable surface is `.cm-content` inside the element with `data-testid={testId}`.

- [ ] **Step 1: Install**

```bash
npm install codemirror @codemirror/state @codemirror/view @codemirror/language @codemirror/lang-json @codemirror/lint @codemirror/theme-one-dark
npm ls @codemirror/state @codemirror/view
```
Expected: each package resolves to one version (repeats marked `deduped`).

- [ ] **Step 2: Add the jsdom polyfills CodeMirror needs**

Append to `src/test/setup.ts`:
```ts
// jsdom has no layout; CodeMirror measures text with these.
const emptyRect = {
  x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
  toJSON: () => ({}),
};
Range.prototype.getBoundingClientRect = () => emptyRect as DOMRect;
Range.prototype.getClientRects = () =>
  ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
```

- [ ] **Step 3: Write the failing tests**

`src/core/theme/useIsDarkTheme.test.ts`:
```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIsDarkTheme } from './useIsDarkTheme';

describe('useIsDarkTheme', () => {
  it('follows the data-theme attribute', async () => {
    document.documentElement.dataset.theme = 'light';
    const { result } = renderHook(() => useIsDarkTheme());
    expect(result.current).toBe(false);
    act(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
```

`src/core/editor/theme.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { editorTheme } from './theme';

describe('editorTheme', () => {
  it('adds the dark theme only in dark mode', () => {
    const light = editorTheme(false) as unknown[];
    const dark = editorTheme(true) as unknown[];
    expect(dark.length).toBe(light.length + 1);
  });
});
```

`src/core/editor/diagnostics.test.ts`:
```ts
import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { errorsToDiagnostics } from './diagnostics';

const doc = Text.of(['{', '  "a": 1', '  "b"', '}']);

describe('errorsToDiagnostics', () => {
  it('maps 1-based line/column to a document offset', () => {
    const [d] = errorsToDiagnostics(doc, [{ message: 'Colon expected', line: 3, column: 6 }]);
    expect(d).toMatchObject({ from: doc.line(3).from + 5, severity: 'error', message: 'Colon expected' });
    expect(d!.to).toBe(d!.from + 1);
  });

  it('clamps out-of-range positions and defaults missing ones to 1:1', () => {
    const [far, none] = errorsToDiagnostics(doc, [{ message: 'x', line: 99, column: 99 }, { message: 'y' }]);
    expect(far!.from).toBe(doc.line(4).to);
    expect(far!.to).toBe(doc.length);
    expect(none!.from).toBe(0);
  });
});
```

`src/core/editor/CodeEditor.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';

describe('CodeEditor', () => {
  it('renders the value, labels the editable area, and follows external value changes', () => {
    const ref = createRef<CodeEditorHandle>();
    const { rerender } = render(
      <CodeEditor value={'{"a":1}'} ariaLabel="Left JSON" testId="ed" ref={ref} />,
    );
    const content = screen.getByTestId('ed').querySelector('.cm-content')!;
    expect(content).toHaveAttribute('aria-label', 'Left JSON');
    expect(content.textContent).toBe('{"a":1}');
    rerender(<CodeEditor value={'[1]'} ariaLabel="Left JSON" testId="ed" ref={ref} />);
    expect(content.textContent).toBe('[1]');
    expect(() => ref.current!.scrollToLine(50)).not.toThrow();
  });

  it('is read-only when asked', () => {
    render(<CodeEditor value="x" ariaLabel="Out" testId="ro" readOnly />);
    expect(screen.getByTestId('ro').querySelector('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run src/core/theme src/core/editor`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement**

`src/core/theme/useIsDarkTheme.ts`:
```ts
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.dataset.theme === 'dark';

export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark);
}
```

`src/core/editor/theme.ts`:
```ts
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

const base = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--bg-editor)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
});

export function editorTheme(dark: boolean): Extension {
  const shared = [base, syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
  return dark ? [...shared, oneDark] : shared;
}
```

`src/core/editor/diagnostics.ts`:
```ts
import type { Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';
import type { ParseError } from '../formats/types';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export function errorsToDiagnostics(doc: Text, errors: readonly ParseError[]): Diagnostic[] {
  return errors.map((error) => {
    const line = doc.line(clamp(error.line ?? 1, 1, doc.lines));
    const from = Math.min(line.from + Math.max((error.column ?? 1) - 1, 0), line.to);
    return { from, to: Math.min(from + 1, doc.length), severity: 'error', message: error.message };
  });
}
```

`src/core/editor/CodeEditor.tsx`:
```tsx
import { json } from '@codemirror/lang-json';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { ParseError } from '../formats/types';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './code-editor.css';
import { errorsToDiagnostics } from './diagnostics';
import { editorTheme } from './theme';

export interface CodeEditorHandle {
  scrollToLine(line: number): void;
  focus(): void;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'json' | 'text';
  readOnly?: boolean;
  errors?: readonly ParseError[];
  ariaLabel: string;
  testId?: string;
  ref?: Ref<CodeEditorHandle>;
}

const NO_ERRORS: readonly ParseError[] = [];
const languageExtension = (language: 'json' | 'text') => (language === 'json' ? json() : []);
const readOnlyExtension = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
];

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  readOnly = false,
  errors = NO_ERRORS,
  ariaLabel,
  testId,
  ref,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const compartments = useRef({
    theme: new Compartment(),
    language: new Compartment(),
    readOnly: new Compartment(),
  });
  const dark = useIsDarkTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const c = compartments.current;
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lintGutter(),
          c.language.of(languageExtension(language)),
          c.readOnly.of(readOnlyExtension(readOnly)),
          c.theme.of(editorTheme(dark)),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Created once; the effects below keep it in sync with props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.theme.reconfigure(editorTheme(dark)) });
  }, [dark]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.language.reconfigure(languageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.readOnly.reconfigure(readOnlyExtension(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch(setDiagnostics(view.state, errorsToDiagnostics(view.state.doc, errors)));
  }, [errors, value]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line: number) {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc;
        const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
        view.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className="code-editor" data-testid={testId} />;
}
```

`src/core/editor/code-editor.css`:
```css
.code-editor { flex: 1; min-height: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.code-editor .cm-editor { height: 100%; }
.code-editor .cm-editor.cm-focused { outline: none; }
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run format
git add -A
git commit -m "feat(core): add CodeMirror-based CodeEditor with inline parse errors"
```

---

### Task 13: `<JsonEditorView>`, query languages, and schema validator

**Files:**
- Create: `src/core/json-view/queryLanguages.ts`, `src/core/json-view/schemaValidator.ts`, `src/core/json-view/JsonEditorView.tsx`, `src/core/json-view/json-view.css`
- Test: `src/core/json-view/queryLanguages.test.ts`, `src/core/json-view/schemaValidator.test.ts`

**Interfaces:**
- Consumes: `jsonAdapter`, `toPlainValue`, `losslessJsonParser` (Task 9); `useIsDarkTheme` (Task 12); the Task 8 decision.
- Produces:
  - `QUERY_LANGUAGES: QueryLanguage[]` (JSONQuery, JMESPath, JSONPath — no eval).
  - `JsonValidator` (= vanilla-jsoneditor `Validator`), `SchemaValidatorResult = { ok: true; validator: JsonValidator } | { ok: false; error: string }`, `createSchemaValidator(schemaText: string): SchemaValidatorResult | null` (`null` = no schema entered), `detectDraft(schema: unknown): SchemaDraft`, `pointerToPath(pointer: string): string[]`, `toValidationErrors(units: OutputUnit[]): ValidationError[]`.
  - `JsonEditorMode = 'text' | 'tree' | 'table'`; `<JsonEditorView value onChange mode? onModeChange? validator?>` rendered as `data-testid="json-editor-view"`. It emits only text via `onChange(text)` and uses the lossless parser so big numbers survive tree edits.

- [ ] **Step 1: Install**

```bash
npm install vanilla-jsoneditor @cfworker/json-schema
npm ls @codemirror/state @codemirror/view
```
Expected: still one version of each (`deduped`). If not, run `npm dedupe` and re-check.

- [ ] **Step 2: Write the failing tests**

`src/core/json-view/queryLanguages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { QUERY_LANGUAGES } from './queryLanguages';

describe('QUERY_LANGUAGES', () => {
  it('offers exactly the three eval-free languages', () => {
    const ids = QUERY_LANGUAGES.map((l) => l.id.toLowerCase());
    expect(ids).toHaveLength(3);
    expect(ids.some((id) => id.includes('javascript') || id.includes('lodash'))).toBe(false);
  });
});
```

`src/core/json-view/schemaValidator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { jsonAdapter } from '../formats/json';
import {
  createSchemaValidator,
  detectDraft,
  pointerToPath,
  toValidationErrors,
} from './schemaValidator';

const value = (text: string) => {
  const r = jsonAdapter.parse(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const PERSON = JSON.stringify({
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
});

describe('createSchemaValidator', () => {
  it('returns null when no schema is entered', () => {
    expect(createSchemaValidator('  ')).toBeNull();
  });

  it('reports invalid schema JSON and non-object schemas', () => {
    expect(createSchemaValidator('{"type":')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^Schema is not valid JSON/),
    });
    expect(createSchemaValidator('[1]')).toEqual({
      ok: false,
      error: 'Schema must be a JSON object or boolean',
    });
  });

  it('validates documents and points errors at the failing value', () => {
    const result = createSchemaValidator(PERSON);
    if (!result?.ok) throw new Error('expected a validator');
    expect(result.validator(value('{"name":"Ada","age":36,"tags":["x"]}'))).toEqual([]);

    const errors = result.validator(value('{"age":"old","tags":["x",5],"extra":true}'));
    const byPath = errors.map((e) => `${e.path.join('/')}|${e.severity}`);
    expect(byPath).toContain('age|error');
    expect(byPath).toContain('tags/1|error');
    expect(errors.some((e) => e.path.length === 0 && /name/.test(e.message))).toBe(true); // required
    expect(errors.some((e) => /extra/.test(e.message))).toBe(true); // additionalProperties
  });

  it('treats big integers as integers (lossless numbers)', () => {
    const result = createSchemaValidator('{"type":"object","properties":{"id":{"type":"integer"}}}');
    if (!result?.ok) throw new Error('expected a validator');
    expect(result.validator(value('{"id":12345678901234567890}'))).toEqual([]);
  });

  it('turns unresolvable remote refs into a schema error instead of throwing or fetching', () => {
    const result = createSchemaValidator('{"$ref":"https://example.com/remote.json"}');
    if (result && !result.ok) {
      expect(result.error).toMatch(/^Schema error/);
      return;
    }
    const errors = result!.validator(value('{}'));
    expect(errors[0]).toMatchObject({ path: [], message: expect.stringMatching(/^Schema error/) });
  });
});

describe('detectDraft', () => {
  it.each([
    [{ $schema: 'http://json-schema.org/draft-04/schema#' }, '4'],
    [{ $schema: 'http://json-schema.org/draft-07/schema#' }, '7'],
    [{ $schema: 'https://json-schema.org/draft/2019-09/schema' }, '2019-09'],
    [{}, '2020-12'],
    [true, '2020-12'],
  ])('%j → %s', (schema, draft) => {
    expect(detectDraft(schema)).toBe(draft);
  });
});

describe('pointerToPath', () => {
  it('decodes JSON pointers with URI encoding and escapes', () => {
    expect(pointerToPath('#')).toEqual([]);
    expect(pointerToPath('#/users/0/e%20mail')).toEqual(['users', '0', 'e mail']);
    expect(pointerToPath('#/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
  });
});

describe('toValidationErrors', () => {
  it('drops applicator noise and duplicates', () => {
    const errors = toValidationErrors([
      {
        keyword: 'properties',
        keywordLocation: '#/properties',
        instanceLocation: '#',
        error: 'Property "a" does not match schema.',
      },
      { keyword: 'type', keywordLocation: '#/properties/a/type', instanceLocation: '#/a', error: 'Wrong type' },
      { keyword: 'type', keywordLocation: '#/properties/a/type', instanceLocation: '#/a', error: 'Wrong type' },
    ]);
    expect(errors).toEqual([{ path: ['a'], message: 'Wrong type', severity: 'error' }]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/core/json-view`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/core/json-view/queryLanguages.ts`:
```ts
import {
  jmespathQueryLanguage,
  jsonpathQueryLanguage,
  jsonQueryLanguage,
  type QueryLanguage,
} from 'vanilla-jsoneditor';

/** Only languages that run without eval/new Function, so the strict CSP holds (intent.md §6.3). */
export const QUERY_LANGUAGES: QueryLanguage[] = [
  jsonQueryLanguage,
  jmespathQueryLanguage,
  jsonpathQueryLanguage,
];
```

`src/core/json-view/schemaValidator.ts`:
```ts
import {
  Validator as SchemaEngine,
  type OutputUnit,
  type Schema,
  type SchemaDraft,
} from '@cfworker/json-schema';
import { ValidationSeverity, type ValidationError, type Validator } from 'vanilla-jsoneditor';
import { jsonAdapter, toPlainValue } from '../formats/json';

export type JsonValidator = Validator;
export type SchemaValidatorResult = { ok: true; validator: JsonValidator } | { ok: false; error: string };

/** Parent-level errors that only repeat a more specific child error. */
const NOISE_KEYWORDS = new Set([
  'properties',
  'items',
  'prefixItems',
  'patternProperties',
  'additionalItems',
  '$ref',
  '$dynamicRef',
  '$recursiveRef',
  'allOf',
  'then',
  'else',
  'dependentSchemas',
  'false',
]);

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function detectDraft(schema: unknown): SchemaDraft {
  const uri =
    schema !== null && typeof schema === 'object'
      ? String((schema as Record<string, unknown>).$schema ?? '')
      : '';
  if (uri.includes('draft-04')) return '4';
  if (uri.includes('draft-06') || uri.includes('draft-07')) return '7';
  if (uri.includes('2019-09')) return '2019-09';
  return '2020-12';
}

export function pointerToPath(pointer: string): string[] {
  const p = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  if (p === '') return [];
  return p
    .slice(1)
    .split('/')
    .map((segment) => decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function toValidationErrors(units: OutputUnit[]): ValidationError[] {
  const seen = new Set<string>();
  const out: ValidationError[] = [];
  for (const unit of units) {
    if (NOISE_KEYWORDS.has(unit.keyword)) continue;
    const key = `${unit.instanceLocation}\u0000${unit.error}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      path: pointerToPath(unit.instanceLocation),
      message: unit.error,
      severity: ValidationSeverity.error,
    });
  }
  return out;
}

export function createSchemaValidator(schemaText: string): SchemaValidatorResult | null {
  if (schemaText.trim() === '') return null;
  const parsed = jsonAdapter.parse(schemaText);
  if (!parsed.ok) return { ok: false, error: `Schema is not valid JSON: ${parsed.error.message}` };
  const schema = toPlainValue(parsed.value, 'approximate');
  const isObject = schema !== null && typeof schema === 'object' && !Array.isArray(schema);
  if (typeof schema !== 'boolean' && !isObject) {
    return { ok: false, error: 'Schema must be a JSON object or boolean' };
  }

  let engine: SchemaEngine;
  try {
    engine = new SchemaEngine(schema as Schema | boolean, detectDraft(schema), false);
  } catch (err) {
    return { ok: false, error: `Schema error: ${messageOf(err)}` };
  }

  const validator: JsonValidator = (json) => {
    try {
      const result = engine.validate(toPlainValue(json, 'approximate'));
      return result.valid ? [] : toValidationErrors(result.errors);
    } catch (err) {
      return [{ path: [], message: `Schema error: ${messageOf(err)}`, severity: ValidationSeverity.error }];
    }
  };
  return { ok: true, validator };
}
```

`src/core/json-view/JsonEditorView.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import {
  createJSONEditor,
  isTextContent,
  Mode,
  toTextContent,
  type Content,
  type JSONEditorPropsOptional,
  type JSONParser,
} from 'vanilla-jsoneditor';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';
import { losslessJsonParser } from '../formats/json';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './json-view.css';
import { QUERY_LANGUAGES } from './queryLanguages';
import type { JsonValidator } from './schemaValidator';

export type JsonEditorMode = 'text' | 'tree' | 'table';

export interface JsonEditorViewProps {
  value: string;
  onChange: (text: string) => void;
  mode?: JsonEditorMode;
  onModeChange?: (mode: JsonEditorMode) => void;
  validator?: JsonValidator;
}

const MODES: Record<JsonEditorMode, Mode> = { text: Mode.text, tree: Mode.tree, table: Mode.table };
const parser = losslessJsonParser as unknown as JSONParser;

function contentToText(content: Content): string {
  return isTextContent(content) ? content.text : toTextContent(content, 2, parser).text;
}

/** The only place in qa-toolbox that touches vanilla-jsoneditor. The rest of the app only sees text. */
export function JsonEditorView({ value, onChange, mode = 'text', onModeChange, validator }: JsonEditorViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);
  const lastText = useRef(value);
  const callbacks = useRef({ onChange, onModeChange });
  const dark = useIsDarkTheme();

  useEffect(() => {
    callbacks.current = { onChange, onModeChange };
  });

  useEffect(() => {
    // A fresh target per mount keeps StrictMode's mount → unmount → mount clean while destroy() is async.
    const target = document.createElement('div');
    target.className = 'json-editor-view__target';
    hostRef.current!.appendChild(target);
    const props: JSONEditorPropsOptional = {
      content: { text: lastText.current },
      mode: MODES[mode],
      parser,
      validator,
      queryLanguages: QUERY_LANGUAGES,
      onChange: (content) => {
        const text = contentToText(content);
        lastText.current = text;
        callbacks.current.onChange(text);
      },
      onChangeMode: (next) => callbacks.current.onModeChange?.(next as JsonEditorMode),
    };
    const editor = createJSONEditor({ target, props });
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
      void editor.destroy().then(() => target.remove());
    };
    // Created once; the effects below sync props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value === lastText.current) return;
    lastText.current = value;
    editorRef.current?.updateProps({ content: { text: value } });
  }, [value]);

  useEffect(() => {
    editorRef.current?.updateProps({ mode: MODES[mode] });
  }, [mode]);

  useEffect(() => {
    editorRef.current?.updateProps({ validator });
  }, [validator]);

  return (
    <div
      ref={hostRef}
      className={`json-editor-view${dark ? ' jse-theme-dark' : ''}`}
      data-testid="json-editor-view"
    />
  );
}
```

`src/core/json-view/json-view.css`:
```css
.json-editor-view { flex: 1; min-height: 0; display: flex; }
.json-editor-view__target { flex: 1; min-width: 0; height: 100%; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/core && npm run typecheck && npm run lint`
Expected: PASS. (`JsonEditorView` is covered by Task 14's E2E tests.)

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(core): wrap vanilla-jsoneditor with eval-free queries and cfworker schema validation"
```

---

### Task 14: JSON Editor tool

**Files:**
- Create: `src/tools/json-editor/logic.ts`, `src/tools/json-editor/status.worker.ts`, `src/tools/json-editor/SchemaPanel.tsx`, `src/tools/json-editor/json-editor.css`, `src/core/ui/Banner.tsx`, `e2e/support/codemirror.ts`, `e2e/json-editor.spec.ts`, `fixtures/bom.json`
- Modify: `src/tools/json-editor/JsonEditorTool.tsx` (replace placeholder), `e2e/support/exercise.ts`
- Test: `src/tools/json-editor/logic.test.ts`, `e2e/json-editor.spec.ts`

**Interfaces:**
- Consumes: Tasks 9–13 (`jsonAdapter`, `repairJson`, `countNodes`, `JsonIndent`, `describeParseError`, `utf8ByteLength`, `formatBytes`, `copyToClipboard`, `downloadText`, `readFileAsText`, `useFileDrop`, `runInWorker`, `WORKER_THRESHOLD_CHARS`, `exposeWorker`, `useDebouncedValue`, `useAsyncValue`, `CodeEditor`, `JsonEditorView`, `createSchemaValidator`, `SchemaValidatorResult`).
- Produces:
  - `logic.ts`: `EditorStatus`, `computeStatus(text)`, `statusLabel(status)`, `IndentChoice = 2 | 4 | '\t'`, `parseIndentChoice(value: string): IndentChoice`, `EditAction`, `EditResult`, `applyEdit(text, action)`.
  - `<Banner kind: 'error' | 'info' onDismiss?>` in `src/core/ui/Banner.tsx` (also used by Task 16).
  - DOM contract (used by E2E): toolbar buttons named `Format`, `Minify`, `Sort keys`, `Repair`, `Open file`, `Copy`, `Download`, `Schema`; select labelled `Indentation`; hidden `data-testid="file-input"`; `data-testid="status-bar"`; schema editor `data-testid="schema-editor"`.
  - E2E helpers `setCodeMirrorText(scope: Locator, text: string)`, `readCodeMirrorText(scope: Locator): Promise<string>`.

- [ ] **Step 1: Write the failing logic tests**

`src/tools/json-editor/logic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyEdit, computeStatus, parseIndentChoice, statusLabel } from './logic';

describe('computeStatus', () => {
  it('is empty for blank input, not an error (Review Focus 4)', () => {
    expect(computeStatus('  \n ')).toEqual({ state: 'empty' });
    expect(statusLabel({ state: 'empty' })).toBe('Empty — paste, type, or drop a JSON file');
  });

  it('reports size and node count for valid JSON', () => {
    const status = computeStatus('{"a":[1,2]}');
    expect(status).toEqual({ state: 'valid', bytes: 11, nodes: 4 });
    expect(statusLabel(status)).toBe('Valid JSON · 11 B · 4 nodes');
  });

  it('reports the parse error position', () => {
    const status = computeStatus('{"a":1,}');
    expect(status.state).toBe('invalid');
    expect(statusLabel(status)).toMatch(/^Invalid JSON: .+ \(line 1, column 8\)$/);
  });
});

describe('parseIndentChoice', () => {
  it('maps select values', () => {
    expect(parseIndentChoice('2')).toBe(2);
    expect(parseIndentChoice('4')).toBe(4);
    expect(parseIndentChoice('tab')).toBe('\t');
    expect(parseIndentChoice('nonsense')).toBe(2);
  });
});

describe('applyEdit', () => {
  it('formats with the chosen indentation', () => {
    expect(applyEdit('[1]', { kind: 'format', indent: 4 })).toEqual({ ok: true, text: '[\n    1\n]' });
  });

  it('minifies', () => {
    expect(applyEdit('{ "a" : [ 1 ] }', { kind: 'minify' })).toEqual({ ok: true, text: '{"a":[1]}' });
  });

  it('sorts keys recursively and keeps big numbers (Review Focus 1)', () => {
    const r = applyEdit('{"b":1,"a":{"d":[1,2],"c":12345678901234567890}}', { kind: 'sortKeys', indent: 2 });
    expect(r.ok && r.text).toBe(
      '{\n  "a": {\n    "c": 12345678901234567890,\n    "d": [\n      1,\n      2\n    ]\n  },\n  "b": 1\n}',
    );
  });

  it('repairs broken JSON', () => {
    expect(applyEdit("{a:'x',}", { kind: 'repair' })).toEqual({ ok: true, text: '{"a":"x"}' });
  });

  it('returns the parse error instead of formatting invalid JSON', () => {
    expect(applyEdit('{"a":', { kind: 'format', indent: 2 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tools/json-editor`
Expected: FAIL — cannot resolve `./logic`.

- [ ] **Step 3: Implement the logic and worker**

`src/tools/json-editor/logic.ts`:
```ts
import { describeParseError } from '../../core/formats/errors';
import { countNodes, jsonAdapter, repairJson, type JsonIndent } from '../../core/formats/json';
import type { ParseError } from '../../core/formats/types';
import { formatBytes, utf8ByteLength } from '../../core/text';

export type EditorStatus =
  | { state: 'empty' }
  | { state: 'valid'; bytes: number; nodes: number }
  | { state: 'invalid'; bytes: number; error: ParseError };

export function computeStatus(text: string): EditorStatus {
  if (text.trim() === '') return { state: 'empty' };
  const bytes = utf8ByteLength(text);
  const result = jsonAdapter.parse(text);
  return result.ok
    ? { state: 'valid', bytes, nodes: countNodes(result.value) }
    : { state: 'invalid', bytes, error: result.error };
}

export function statusLabel(status: EditorStatus): string {
  switch (status.state) {
    case 'empty':
      return 'Empty — paste, type, or drop a JSON file';
    case 'valid':
      return `Valid JSON · ${formatBytes(status.bytes)} · ${status.nodes.toLocaleString('en-US')} nodes`;
    case 'invalid':
      return `Invalid JSON: ${describeParseError(status.error)}`;
  }
}

export type IndentChoice = Exclude<JsonIndent, 0>;

export function parseIndentChoice(value: string): IndentChoice {
  if (value === '4') return 4;
  if (value === 'tab') return '\t';
  return 2;
}

export type EditAction =
  | { kind: 'format'; indent: IndentChoice }
  | { kind: 'minify' }
  | { kind: 'sortKeys'; indent: IndentChoice }
  | { kind: 'repair' };

export type EditResult = { ok: true; text: string } | { ok: false; error: ParseError };

export function applyEdit(text: string, action: EditAction): EditResult {
  if (action.kind === 'repair') return repairJson(text);
  const parsed = jsonAdapter.parse(text);
  if (!parsed.ok) return parsed;
  switch (action.kind) {
    case 'format':
      return { ok: true, text: jsonAdapter.stringify(parsed.value, { indent: action.indent }) };
    case 'minify':
      return { ok: true, text: jsonAdapter.stringify(parsed.value, { indent: 0 }) };
    case 'sortKeys':
      return {
        ok: true,
        text: jsonAdapter.stringify(parsed.value, { indent: action.indent, sortKeys: true }),
      };
  }
}
```

`src/tools/json-editor/status.worker.ts`:
```ts
import { exposeWorker } from '../../core/worker/expose';
import { computeStatus } from './logic';

exposeWorker(computeStatus);
```

- [ ] **Step 4: Run to verify the logic passes**

Run: `npx vitest run src/tools/json-editor`
Expected: PASS. (If jsonrepair's whitespace differs for the repair case, handle it as in Task 9 Step 5 — ask the user before changing the test.)

- [ ] **Step 5: Build the UI**

`src/core/ui/Banner.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Banner({
  kind,
  children,
  onDismiss,
}: {
  kind: 'error' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner banner--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
```

`src/tools/json-editor/SchemaPanel.tsx`:
```tsx
import { CodeEditor } from '../../core/editor/CodeEditor';
import type { SchemaValidatorResult } from '../../core/json-view/schemaValidator';

export function SchemaPanel({
  value,
  onChange,
  result,
}: {
  value: string;
  onChange: (text: string) => void;
  result: SchemaValidatorResult | null;
}) {
  return (
    <aside className="schema-panel" aria-label="JSON Schema">
      <div className="schema-panel__header">
        <strong>JSON Schema</strong>
        {result === null && <span className="schema-panel__hint">Paste a schema to validate the document</span>}
        {result?.ok && <span className="schema-panel__ok">Validating</span>}
        {result && !result.ok && (
          <span className="schema-panel__error" role="alert">
            {result.error}
          </span>
        )}
      </div>
      <CodeEditor
        value={value}
        onChange={onChange}
        language="json"
        ariaLabel="JSON Schema editor"
        testId="schema-editor"
      />
    </aside>
  );
}
```

`src/tools/json-editor/JsonEditorTool.tsx` (replace the placeholder):
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { describeParseError } from '../../core/formats/errors';
import { copyToClipboard } from '../../core/io/clipboard';
import { downloadText } from '../../core/io/download';
import { readFileAsText } from '../../core/io/file';
import { useFileDrop } from '../../core/io/useFileDrop';
import { JsonEditorView } from '../../core/json-view/JsonEditorView';
import { createSchemaValidator } from '../../core/json-view/schemaValidator';
import { useAsyncValue } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import { Banner } from '../../core/ui/Banner';
import { runInWorker, WORKER_THRESHOLD_CHARS } from '../../core/worker/runInWorker';
import './json-editor.css';
import {
  applyEdit,
  computeStatus,
  parseIndentChoice,
  statusLabel,
  type EditAction,
  type EditorStatus,
  type IndentChoice,
} from './logic';
import { SchemaPanel } from './SchemaPanel';

type Notice = { kind: 'error' | 'info'; text: string } | null;

const ACTION_VERB: Record<EditAction['kind'], string> = {
  format: 'format',
  minify: 'minify',
  sortKeys: 'sort keys',
  repair: 'repair',
};

const createStatusWorker = () =>
  new Worker(new URL('./status.worker.ts', import.meta.url), { type: 'module' });

async function computeStatusAsync(text: string, signal: AbortSignal): Promise<EditorStatus> {
  return text.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<string, EditorStatus>(createStatusWorker, text, { signal })
    : computeStatus(text);
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function JsonEditorTool() {
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<IndentChoice>(2);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const status = useAsyncValue(useDebouncedValue(text, 150), computeStatusAsync);
  const debouncedSchema = useDebouncedValue(schemaText, 300);
  const schema = useMemo(() => createSchemaValidator(debouncedSchema), [debouncedSchema]);
  const validator = schemaOpen && schema?.ok ? schema.validator : undefined;

  useEffect(() => {
    if (notice?.kind !== 'info') return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  const run = (action: EditAction) => {
    const result = applyEdit(text, action);
    if (result.ok) {
      setText(result.text);
      setNotice(null);
    } else {
      setNotice({
        kind: 'error',
        text: `Can't ${ACTION_VERB[action.kind]}: ${describeParseError(result.error)}`,
      });
    }
  };

  const openFile = async (file: File) => {
    try {
      setText(await readFileAsText(file));
      setNotice(null);
    } catch (err) {
      setNotice({ kind: 'error', text: messageOf(err) });
    }
  };
  const { isOver, dropProps } = useFileDrop((file) => void openFile(file));

  const copy = async () => {
    try {
      await copyToClipboard(text);
      setNotice({ kind: 'info', text: 'Copied to clipboard' });
    } catch (err) {
      setNotice({ kind: 'error', text: messageOf(err) });
    }
  };

  const statusClass =
    status.status === 'done' && status.value.state !== 'empty' ? ` status-bar--${status.value.state}` : '';

  return (
    <div className="json-editor-tool">
      <div className="toolbar" role="toolbar" aria-label="JSON actions">
        <button type="button" onClick={() => run({ kind: 'format', indent })}>
          Format
        </button>
        <select
          aria-label="Indentation"
          value={indent === '\t' ? 'tab' : String(indent)}
          onChange={(e) => setIndent(parseIndentChoice(e.target.value))}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <button type="button" onClick={() => run({ kind: 'minify' })}>
          Minify
        </button>
        <button type="button" onClick={() => run({ kind: 'sortKeys', indent })}>
          Sort keys
        </button>
        <button type="button" onClick={() => run({ kind: 'repair' })}>
          Repair
        </button>
        <span className="toolbar__spacer" />
        <button type="button" onClick={() => fileInput.current?.click()}>
          Open file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => void copy()} disabled={text === ''}>
          Copy
        </button>
        <button type="button" onClick={() => downloadText('document.json', text)} disabled={text === ''}>
          Download
        </button>
        <button type="button" aria-pressed={schemaOpen} onClick={() => setSchemaOpen((open) => !open)}>
          Schema
        </button>
      </div>

      {notice && (
        <Banner kind={notice.kind} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}

      <div className={`json-editor-tool__workspace${isOver ? ' is-drop-target' : ''}`} {...dropProps}>
        <JsonEditorView value={text} onChange={setText} validator={validator} />
        {schemaOpen && <SchemaPanel value={schemaText} onChange={setSchemaText} result={schema} />}
      </div>

      <div className={`status-bar${statusClass}`} data-testid="status-bar" role="status">
        {status.status === 'done' && statusLabel(status.value)}
        {status.status === 'pending' && 'Checking…'}
        {status.status === 'error' && `Could not check the document: ${status.error.message}`}
      </div>
    </div>
  );
}
```

`src/tools/json-editor/json-editor.css`:
```css
.json-editor-tool { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
.json-editor-tool__workspace { display: flex; gap: 8px; flex: 1; min-height: 0; border-radius: var(--radius); }
.json-editor-tool__workspace.is-drop-target { outline: 2px dashed var(--accent); outline-offset: 2px; }
.schema-panel { display: flex; flex-direction: column; gap: 6px; width: min(40%, 480px); min-height: 0; }
.schema-panel__header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 12px; }
.schema-panel__hint { color: var(--fg-muted); }
.schema-panel__ok { color: var(--ok); }
.schema-panel__error { color: var(--danger); }
```

Create `fixtures/bom.json` with a real BOM:
```bash
mkdir -p fixtures
printf '\xEF\xBB\xBF{"source": "windows", "ok": true}\n' > fixtures/bom.json
```

- [ ] **Step 6: Check it in the browser**

Run: `npm run dev`, open `#/tools/json-editor`. Paste `{"b":1,"a":[1,2]}`; click Format, Minify, Sort keys; add a trailing comma and click Repair; switch tree/table in the editor menu; open Schema and paste `{"type":"object","properties":{"b":{"type":"string"}}}`.
Expected: each action updates the text; the status bar shows Valid/Invalid with position; a validation error for `b` appears in the editor.

- [ ] **Step 7: Write the E2E helpers and spec**

`e2e/support/codemirror.ts`:
```ts
import type { Locator } from '@playwright/test';

/** Replaces the whole document of the first CodeMirror editor inside `scope`. */
export async function setCodeMirrorText(scope: Locator, text: string): Promise<void> {
  const content = scope.locator('.cm-content').first();
  await content.click();
  await content.press('ControlOrMeta+a');
  if (text === '') await content.press('Delete');
  else await scope.page().keyboard.insertText(text);
}

/** Reads a small document (CodeMirror only renders visible lines). */
export async function readCodeMirrorText(scope: Locator): Promise<string> {
  return (await scope.locator('.cm-content').first().locator('.cm-line').allInnerTexts()).join('\n');
}
```

`e2e/json-editor.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { readCodeMirrorText, setCodeMirrorText } from './support/codemirror';

const editor = (page: Page) => page.getByTestId('json-editor-view');
const status = (page: Page) => page.getByTestId('status-bar');

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/json-editor');
  await expect(editor(page).locator('.cm-content')).toBeVisible();
});

test('starts empty with a neutral status (Review Focus 4)', async ({ page }) => {
  await expect(status(page)).toHaveText('Empty — paste, type, or drop a JSON file');
});

test('formats with 4 spaces, minifies, and sorts keys', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"b":1,"a":[1,2]}');
  await page.getByLabel('Indentation').selectOption('4');
  await page.getByRole('button', { name: 'Format' }).click();
  await expect
    .poll(() => readCodeMirrorText(editor(page)))
    .toBe('{\n    "b": 1,\n    "a": [\n        1,\n        2\n    ]\n}');

  await page.getByRole('button', { name: 'Minify' }).click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{"b":1,"a":[1,2]}');

  await page.getByRole('button', { name: 'Sort keys' }).click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toMatch(/^\{\n {4}"a": \[/);
  await expect(status(page)).toHaveText(/^Valid JSON · \d+ B · 5 nodes$/);
});

test('keeps big integers exact through formatting (Review Focus 1)', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"id":12345678901234567890}');
  await page.getByRole('button', { name: 'Format' }).click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toContain('"id": 12345678901234567890');
});

test('shows parse errors with position and repairs them', async ({ page }) => {
  await setCodeMirrorText(editor(page), "{a: 'x',}");
  await expect(status(page)).toContainText('Invalid JSON');
  await expect(status(page)).toContainText('line 1');
  await page.getByRole('button', { name: 'Format' }).click();
  await expect(page.getByRole('alert').filter({ hasText: "Can't format" })).toBeVisible();
  await page.getByRole('button', { name: 'Repair' }).click();
  await expect(status(page)).toContainText('Valid JSON');
});

test('switches to tree mode', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"a":{"b":1}}');
  await editor(page).getByRole('button', { name: /^tree$/i }).click();
  await expect(editor(page).locator('.jse-tree-mode')).toBeVisible();
});

test('validates against a JSON Schema', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"age":"old"}');
  await page.getByRole('button', { name: 'Schema' }).click();
  await setCodeMirrorText(
    page.getByTestId('schema-editor'),
    '{"type":"object","properties":{"age":{"type":"number"}}}',
  );
  await expect(page.getByText('Validating')).toBeVisible();
  await expect(editor(page).getByText(/number/i).first()).toBeVisible();
});

test('opens a file that starts with a BOM (Review Focus 2)', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles('fixtures/bom.json');
  await expect(status(page)).toContainText('Valid JSON');
  await expect.poll(() => readCodeMirrorText(editor(page))).toContain('"source": "windows"');
});

test('rejects a binary file with a message (Review Focus 2)', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0x1a]),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'binary file' })).toBeVisible();
});

test('downloads the document', async ({ page }) => {
  await setCodeMirrorText(editor(page), '[1]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('document.json');
});

test('copies to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are only scriptable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setCodeMirrorText(editor(page), '{"copied":true}');
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Copied to clipboard')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('{"copied":true}');
});
```

Replace `e2e/support/exercise.ts` with:
```ts
import type { Page } from '@playwright/test';
import { setCodeMirrorText } from './codemirror';

type Exercise = (page: Page) => Promise<void>;

/** Per-tool "use it for real" steps, used by the no-egress and CSP checks. */
const EXERCISES: Record<string, Exercise> = {
  'json-editor': async (page) => {
    const editor = page.getByTestId('json-editor-view');
    await setCodeMirrorText(editor, '{"items":[{"id":1},{"id":2}]}');
    await page.getByRole('button', { name: 'Format' }).click();
    await page.getByRole('button', { name: 'Schema' }).click();
    await setCodeMirrorText(page.getByTestId('schema-editor'), '{"type":"object"}');
    await page.getByText('Validating').waitFor();
    await editor.getByRole('button', { name: /^tree$/i }).click();
  },
};

export async function exerciseTool(page: Page, toolId: string): Promise<void> {
  await EXERCISES[toolId]?.(page);
}
```

- [ ] **Step 8: Run E2E on all browsers**

Run: `npm run e2e`
Expected: all specs PASS (clipboard test skipped on Firefox/WebKit). If the tree-mode button or `.jse-tree-mode` selector doesn't match the library's markup, inspect with `npx playwright codegen http://localhost:4173/#/tools/json-editor` (after `npm run build && npm run preview`), then propose the selector change to the user and wait for their confirmation before editing the spec.

- [ ] **Step 9: Verify, then commit**

Run: `npm run verify`
Expected: PASS, coverage ≥ 90 %, the bundle check lists `src/tools/json-editor/JsonEditorTool.tsx` within 600 KB. If the route exceeds the budget, stop and report the measured size to the user — don't raise the budget.

```bash
git add -A
git commit -m "feat(json-editor): add JSON Editor tool with format, repair, schema, and file I/O"
```

---

### Task 15: Diff core — structural diff, paths, text diff view, change list

**Files:**
- Create: `src/core/diff/paths.ts`, `src/core/diff/structural.ts`, `src/core/diff/format.ts`, `src/core/diff/TextDiffView.tsx`, `src/core/diff/ChangeList.tsx`, `src/core/diff/diff.css`
- Test: `src/core/diff/paths.test.ts`, `src/core/diff/structural.test.ts`, `src/core/diff/format.test.ts`, `src/core/diff/ChangeList.test.tsx`

**Interfaces:**
- Consumes: `editorTheme`, `useIsDarkTheme` (Task 12).
- Produces:
  - `PathSegment = string | number`; `toJsonPath(path): string` (`$.users[2].email`, `$["my key"]`); `toJsonPointer(path): string` (`/users/2/email`).
  - `ChangeKind = 'added' | 'removed' | 'changed' | 'moved'`; `Change` (`added {path, after}`, `removed {path, before}`, `changed {path, before, after}`, `moved {path, toIndex}`); `DiffSide = 'left' | 'right'`; `structuralDiff(left: unknown, right: unknown): Change[]` (array items matched by `id` / `_id` / `uuid` when present); `ChangeSummary = Record<ChangeKind, number>`; `summarizeChanges(changes): ChangeSummary`. Paths of `removed`/`moved` refer to the **left** document; others to the **right**.
  - `formatValue(value, maxLength = 80): string`; `describeChange(change): string`; `CHANGE_LABELS: Record<ChangeKind, string>`.
  - `<TextDiffView left right language? ref?: Ref<TextDiffViewHandle>>` (`data-testid="text-diff-view"`); `TextDiffViewHandle { next(): void; prev(): void; scrollToLine(side: DiffSide, line: number): void }`.
  - `<ChangeList changes onSelect? limit = 1000>` — `ul[aria-label="Changes"]` of buttons.

- [ ] **Step 1: Install**

```bash
npm install jsondiffpatch @codemirror/merge
npm ls @codemirror/state @codemirror/view
```
Expected: one version of each.

- [ ] **Step 2: Write the failing tests**

`src/core/diff/paths.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toJsonPath, toJsonPointer } from './paths';

describe('paths', () => {
  it('builds JSONPath with dot and bracket notation', () => {
    expect(toJsonPath([])).toBe('$');
    expect(toJsonPath(['users', 2, 'email'])).toBe('$.users[2].email');
    expect(toJsonPath(['my key', '$ok', '1abc'])).toBe('$["my key"].$ok["1abc"]');
  });

  it('builds escaped JSON pointers', () => {
    expect(toJsonPointer([])).toBe('');
    expect(toJsonPointer(['a/b', 'c~d', 0])).toBe('/a~1b/c~0d/0');
  });
});
```

`src/core/diff/structural.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { structuralDiff, summarizeChanges } from './structural';

describe('structuralDiff', () => {
  it('returns no changes for equal values regardless of key order', () => {
    expect(structuralDiff({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([]);
  });

  it('reports added, removed, and changed object keys', () => {
    const changes = structuralDiff(
      { a: 1, gone: true, nested: { x: 'old' } },
      { a: 2, nested: { x: 'new' }, fresh: null },
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: 'changed', path: ['a'], before: 1, after: 2 },
        { kind: 'removed', path: ['gone'], before: true },
        { kind: 'changed', path: ['nested', 'x'], before: 'old', after: 'new' },
        { kind: 'added', path: ['fresh'], after: null },
      ]),
    );
    expect(changes).toHaveLength(4);
  });

  it('reports a root-level change', () => {
    expect(structuralDiff(1, 'one')).toEqual([{ kind: 'changed', path: [], before: 1, after: 'one' }]);
  });

  it('matches array objects by id, so reordering is a move (Review Focus 5)', () => {
    const left = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }];
    const right = [{ id: 3, n: 'c' }, { id: 1, n: 'a' }, { id: 2, n: 'b' }];
    const summary = summarizeChanges(structuralDiff(left, right));
    expect(summary.changed).toBe(0);
    expect(summary.moved).toBeGreaterThan(0);
  });

  it('reports an inserted array element as one addition', () => {
    expect(structuralDiff([1, 2, 3], [0, 1, 2, 3])).toEqual([{ kind: 'added', path: [0], after: 0 }]);
  });

  it('compares bigints by value', () => {
    expect(structuralDiff({ id: 12345678901234567890n }, { id: 12345678901234567890n })).toEqual([]);
    expect(structuralDiff({ id: 12345678901234567890n }, { id: 12345678901234567891n })).toHaveLength(1);
  });

  it('keeps a user key named "_t"', () => {
    expect(structuralDiff({ _t: 1 }, { _t: 2 })).toEqual([
      { kind: 'changed', path: ['_t'], before: 1, after: 2 },
    ]);
  });
});

describe('summarizeChanges', () => {
  it('counts by kind', () => {
    expect(
      summarizeChanges([
        { kind: 'added', path: [], after: 1 },
        { kind: 'added', path: [], after: 2 },
        { kind: 'moved', path: [0], toIndex: 1 },
      ]),
    ).toEqual({ added: 2, removed: 0, changed: 0, moved: 1 });
  });
});
```

`src/core/diff/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeChange, formatValue } from './format';

describe('formatValue', () => {
  it('formats strings, bigints, objects, and truncates', () => {
    expect(formatValue('a')).toBe('"a"');
    expect(formatValue(12345678901234567890n)).toBe('12345678901234567890');
    expect(formatValue({ id: 1n, tags: ['x'] })).toBe('{"id":1,"tags":["x"]}');
    expect(formatValue(undefined)).toBe('undefined');
    expect(formatValue('x'.repeat(100), 10)).toBe('"xxxxxxxx…');
  });
});

describe('describeChange', () => {
  it('describes each kind', () => {
    expect(describeChange({ kind: 'added', path: ['a'], after: 1 })).toBe('1');
    expect(describeChange({ kind: 'removed', path: ['a'], before: 'x' })).toBe('"x"');
    expect(describeChange({ kind: 'changed', path: ['a'], before: 1, after: 2 })).toBe('1 → 2');
    expect(describeChange({ kind: 'moved', path: [0], toIndex: 3 })).toBe('to index 3');
  });
});
```

`src/core/diff/ChangeList.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangeList } from './ChangeList';
import type { Change } from './structural';

describe('ChangeList', () => {
  it('lists changes with path and detail and reports clicks', async () => {
    const change: Change = { kind: 'changed', path: ['user', 'email'], before: 'a', after: 'b' };
    const onSelect = vi.fn();
    render(<ChangeList changes={[change]} onSelect={onSelect} />);
    const item = screen.getByRole('button', { name: /Changed \$\.user\.email "a" → "b"/ });
    await userEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(change);
  });

  it('caps long lists', () => {
    const many: Change[] = Array.from({ length: 5 }, (_, i) => ({ kind: 'added', path: [i], after: i }));
    render(<ChangeList changes={many} limit={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Showing the first 2 of 5 changes.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/core/diff`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/core/diff/paths.ts`:
```ts
export type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function toJsonPath(path: readonly PathSegment[]): string {
  return (
    '$' +
    path
      .map((s) =>
        typeof s === 'number' ? `[${s}]` : IDENTIFIER.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`,
      )
      .join('')
  );
}

export function toJsonPointer(path: readonly PathSegment[]): string {
  return path.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}
```

`src/core/diff/structural.ts`:
```ts
import { create } from 'jsondiffpatch';
import type { PathSegment } from './paths';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';
export type Change =
  | { kind: 'added'; path: PathSegment[]; after: unknown }
  | { kind: 'removed'; path: PathSegment[]; before: unknown }
  | { kind: 'changed'; path: PathSegment[]; before: unknown; after: unknown }
  | { kind: 'moved'; path: PathSegment[]; toIndex: number };
export type DiffSide = 'left' | 'right';
export type ChangeSummary = Record<ChangeKind, number>;

const differ = create({
  // Match array items by a stable id when they have one, so reorders read as moves.
  objectHash: (item: object, index?: number) => {
    const record = item as Record<string, unknown>;
    const id = record.id ?? record._id ?? record.uuid;
    return ['string', 'number', 'bigint'].includes(typeof id)
      ? `id:${String(id)}`
      : `$$index:${index ?? 0}`;
  },
  arrays: { detectMove: true, includeValueOnMove: false },
});

type DeltaNode = unknown[] | Record<string, unknown>;

// Delta format: https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
function collect(delta: DeltaNode, path: PathSegment[], out: Change[]): void {
  if (Array.isArray(delta)) {
    if (delta.length === 1) out.push({ kind: 'added', path, after: delta[0] });
    else if (delta.length === 2) out.push({ kind: 'changed', path, before: delta[0], after: delta[1] });
    else if (delta[2] === 0) out.push({ kind: 'removed', path, before: delta[0] });
    else if (delta[2] === 3) out.push({ kind: 'moved', path, toIndex: delta[1] as number });
    return;
  }
  const isArrayDelta = delta._t === 'a';
  for (const key of Object.keys(delta)) {
    if (isArrayDelta && key === '_t') continue;
    // Array keys: "N" = index in the right array, "_N" = index in the left array.
    const segment: PathSegment = isArrayDelta ? Number(key.startsWith('_') ? key.slice(1) : key) : key;
    collect(delta[key] as DeltaNode, [...path, segment], out);
  }
}

export function structuralDiff(left: unknown, right: unknown): Change[] {
  const delta = differ.diff(left, right) as DeltaNode | undefined;
  const out: Change[] = [];
  if (delta !== undefined) collect(delta, [], out);
  return out;
}

export function summarizeChanges(changes: readonly Change[]): ChangeSummary {
  const summary: ChangeSummary = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const change of changes) summary[change.kind]++;
  return summary;
}
```

`src/core/diff/format.ts`:
```ts
import type { Change, ChangeKind } from './structural';

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  moved: 'Moved',
};

// Previews only: a bigint nested inside an object is shown approximately. A changed bigint value itself
// is formatted exactly by the bigint branch below, and the text diff always shows exact text.
const bigintSafe = (_key: string, value: unknown) => (typeof value === 'bigint' ? Number(value) : value);

export function formatValue(value: unknown, maxLength = 80): string {
  const text =
    typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'string'
        ? JSON.stringify(value)
        : (JSON.stringify(value, bigintSafe) ?? String(value));
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function describeChange(change: Change): string {
  switch (change.kind) {
    case 'added':
      return formatValue(change.after);
    case 'removed':
      return formatValue(change.before);
    case 'changed':
      return `${formatValue(change.before, 40)} → ${formatValue(change.after, 40)}`;
    case 'moved':
      return `to index ${change.toIndex}`;
  }
}
```

`src/core/diff/ChangeList.tsx`:
```tsx
import './diff.css';
import { CHANGE_LABELS, describeChange } from './format';
import { toJsonPath } from './paths';
import type { Change } from './structural';

export function ChangeList({
  changes,
  onSelect,
  limit = 1000,
}: {
  changes: readonly Change[];
  onSelect?: (change: Change) => void;
  limit?: number;
}) {
  const shown = changes.slice(0, limit);
  return (
    <div className="change-list">
      <ul aria-label="Changes">
        {shown.map((change, i) => (
          <li key={i}>
            <button type="button" className={`change change--${change.kind}`} onClick={() => onSelect?.(change)}>
              <span className="change__kind">{CHANGE_LABELS[change.kind]}</span>{' '}
              <code className="change__path">{toJsonPath(change.path)}</code>{' '}
              <span className="change__detail">{describeChange(change)}</span>
            </button>
          </li>
        ))}
      </ul>
      {changes.length > limit && (
        <p className="change-list__more">
          Showing the first {limit} of {changes.length} changes.
        </p>
      )}
    </div>
  );
}
```

`src/core/diff/TextDiffView.tsx`:
```tsx
import { json } from '@codemirror/lang-json';
import { goToNextChunk, goToPreviousChunk, MergeView } from '@codemirror/merge';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { editorTheme } from '../editor/theme';
import { useIsDarkTheme } from '../theme/useIsDarkTheme';
import './diff.css';
import type { DiffSide } from './structural';

export interface TextDiffViewHandle {
  next(): void;
  prev(): void;
  scrollToLine(side: DiffSide, line: number): void;
}

export interface TextDiffViewProps {
  left: string;
  right: string;
  language?: 'json' | 'text';
  ref?: Ref<TextDiffViewHandle>;
}

export function TextDiffView({ left, right, language = 'text', ref }: TextDiffViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MergeView | null>(null);
  const dark = useIsDarkTheme();

  useEffect(() => {
    const extensions = [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      language === 'json' ? json() : [],
      editorTheme(dark),
    ];
    const view = new MergeView({
      a: { doc: left, extensions },
      b: { doc: right, extensions },
      parent: hostRef.current!,
      collapseUnchanged: { margin: 3, minSize: 6 },
      diffConfig: { scanLimit: 10_000, timeout: 2_000 },
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [left, right, language, dark]);

  useImperativeHandle(
    ref,
    () => {
      const command = (run: typeof goToNextChunk) => {
        const view = viewRef.current;
        if (view) run({ state: view.b.state, dispatch: (tr: Transaction) => view.b.dispatch(tr) });
      };
      return {
        next: () => command(goToNextChunk),
        prev: () => command(goToPreviousChunk),
        scrollToLine(side, line) {
          const view = viewRef.current;
          if (!view) return;
          const editor = side === 'left' ? view.a : view.b;
          const doc = editor.state.doc;
          const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
          editor.dispatch({
            selection: { anchor: target.from },
            effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
          });
        },
      };
    },
    [],
  );

  return <div ref={hostRef} className="text-diff-view" data-testid="text-diff-view" />;
}
```

`src/core/diff/diff.css`:
```css
.text-diff-view { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.text-diff-view .cm-mergeView { height: 100%; }
.change-list { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.change-list ul { list-style: none; margin: 0; padding: 0; }
.change { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; padding: 6px 10px; font-size: 13px; }
.change__kind { display: inline-block; min-width: 72px; font-weight: 600; }
.change--added .change__kind { color: var(--added); }
.change--removed .change__kind { color: var(--removed); }
.change--changed .change__kind { color: var(--changed); }
.change--moved .change__kind { color: var(--moved); }
.change__path { font-family: var(--font-mono); }
.change__detail { color: var(--fg-muted); font-family: var(--font-mono); }
.change-list__more { padding: 6px 10px; color: var(--fg-muted); }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/core/diff && npm run typecheck`
Expected: PASS. If the move test fails because jsondiffpatch shapes the reorder differently, log `structuralDiff(left, right)` and compare it with the delta docs linked in `structural.ts` — fix `collect`, not the test's intent (no `changed` entries for a pure reorder).

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(core): add structural diff, JSON paths, merge view, and change list"
```

---

### Task 16: JSON Compare tool

**Files:**
- Create: `src/tools/json-compare/index.ts`, `src/tools/json-compare/logic.ts`, `src/tools/json-compare/compare.worker.ts`, `src/tools/json-compare/ComparePane.tsx`, `src/tools/json-compare/JsonCompareTool.tsx`, `src/tools/json-compare/json-compare.css`, `src/types/json-source-map.d.ts`, `e2e/json-compare.spec.ts`
- Modify: `src/tools/registry.ts`, `e2e/support/exercise.ts`
- Test: `src/tools/json-compare/logic.test.ts`, `e2e/json-compare.spec.ts`

**Interfaces:**
- Consumes: `jsonAdapter`, `toPlainValue`, `ParseError` (Task 9); `readFileAsText`, `useFileDrop` (Task 10); `runInWorker`, `WORKER_THRESHOLD_CHARS`, `exposeWorker`, `useDebouncedValue`, `useAsyncValue` (Task 11); `CodeEditor` (Task 12); `Banner` (Task 14); `structuralDiff`, `summarizeChanges`, `Change`, `DiffSide`, `toJsonPointer`, `PathSegment`, `TextDiffView`, `TextDiffViewHandle`, `ChangeList` (Task 15).
- Produces:
  - `jsonCompare: ToolDefinition` (id `json-compare`, name `JSON Compare`), registered after `jsonEditor`.
  - `logic.ts`: `CompareOptions { ignoreKeyOrder }`, `CompareInput { left; right; options }`, `SideIssue = { kind: 'empty' } | { kind: 'invalid'; error: ParseError }`, `CompareResult = { ok: true; leftText; rightText; changes: Change[] } | { ok: false; left: SideIssue | null; right: SideIssue | null }`, `compareJson(input)`, `summaryText(result | null)`, `lineOfPath(text, path): number | undefined`, `sideOfChange(change): DiffSide`.
  - DOM contract: panes `data-testid="compare-left"` / `"compare-right"` (each containing a CodeEditor), file inputs `data-testid="file-input-left"` / `"file-input-right"`, checkbox labelled `Ignore key order`, button `Swap sides`, tabs `Changes` / `Text diff`, buttons `Previous change` / `Next change`, `data-testid="compare-summary"`.

- [ ] **Step 1: Install and add types**

```bash
npm install json-source-map
```

`src/types/json-source-map.d.ts`:
```ts
declare module 'json-source-map' {
  interface Location {
    line: number;
    column: number;
    pos: number;
  }
  interface Pointer {
    value: Location;
    valueEnd: Location;
    key?: Location;
    keyEnd?: Location;
  }
  const jsonMap: { parse(source: string): { data: unknown; pointers: Record<string, Pointer> } };
  export default jsonMap;
}
```

- [ ] **Step 2: Write the failing logic tests**

`src/tools/json-compare/logic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { compareJson, lineOfPath, sideOfChange, summaryText } from './logic';

const compare = (left: string, right: string, ignoreKeyOrder = true) =>
  compareJson({ left, right, options: { ignoreKeyOrder } });

describe('compareJson', () => {
  it('asks for input when a side is empty (Review Focus 4)', () => {
    const result = compare('', '{"a":1}');
    expect(result).toEqual({ ok: false, left: { kind: 'empty' }, right: null });
    expect(summaryText(result)).toBe('Paste JSON on both sides to compare');
  });

  it('reports invalid sides with their parse errors', () => {
    const result = compare('{"a":', '{"a":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.left).toMatchObject({ kind: 'invalid', error: { line: 1 } });
    expect(summaryText(result)).toBe('Fix the JSON errors to compare');
  });

  it('says identical when only formatting and key order differ (Review Focus 5)', () => {
    const result = compare('{"a":1,"b":[1,2]}', '{\n  "b": [1, 2],\n  "a": 1\n}');
    expect(result.ok && result.changes).toEqual([]);
    expect(summaryText(result)).toBe('No differences');
  });

  it('distinguishes data-equal but text-different documents', () => {
    expect(summaryText(compare('{"a":1,"b":2}', '{"b":2,"a":1}', false))).toBe(
      'Same data — key order or number notation differs',
    );
    expect(summaryText(compare('{"a":1.0}', '{"a":1}'))).toBe(
      'Same data — key order or number notation differs',
    );
  });

  it('normalizes both sides to 2-space JSON, sorted when ignoring key order', () => {
    const result = compare('{"b":1,"a":2}', '{"a":2}');
    if (!result.ok) throw new Error('expected ok');
    expect(result.leftText).toBe('{\n  "a": 2,\n  "b": 1\n}');
    expect(result.rightText).toBe('{\n  "a": 2\n}');
  });

  it('summarizes changes with correct plurals', () => {
    expect(summaryText(compare('{"a":1}', '{"a":2}'))).toBe('1 change: 0 added, 0 removed, 1 changed, 0 moved');
    expect(summaryText(compare('{"a":1}', '{"a":2,"b":3}'))).toBe(
      '2 changes: 1 added, 0 removed, 1 changed, 0 moved',
    );
  });

  it('detects a one-digit change in a big integer (Review Focus 1)', () => {
    const result = compare('{"id":12345678901234567890}', '{"id":12345678901234567891}');
    expect(result.ok && result.changes).toEqual([
      { kind: 'changed', path: ['id'], before: 12345678901234567890n, after: 12345678901234567891n },
    ]);
  });
});

describe('summaryText', () => {
  it('handles the pending state', () => {
    expect(summaryText(null)).toBe('Comparing…');
  });
});

describe('lineOfPath', () => {
  const text = '{\n  "a": 1,\n  "users": [\n    {\n      "email": "x"\n    }\n  ]\n}';
  it('finds the 1-based line of a path', () => {
    expect(lineOfPath(text, [])).toBe(1);
    expect(lineOfPath(text, ['a'])).toBe(2);
    expect(lineOfPath(text, ['users', 0, 'email'])).toBe(5);
  });
  it('returns undefined for missing paths or invalid text', () => {
    expect(lineOfPath(text, ['nope'])).toBeUndefined();
    expect(lineOfPath('{', ['a'])).toBeUndefined();
  });
});

describe('sideOfChange', () => {
  it('locates removals and moves on the left, others on the right', () => {
    expect(sideOfChange({ kind: 'removed', path: [], before: 1 })).toBe('left');
    expect(sideOfChange({ kind: 'moved', path: [0], toIndex: 1 })).toBe('left');
    expect(sideOfChange({ kind: 'added', path: [], after: 1 })).toBe('right');
    expect(sideOfChange({ kind: 'changed', path: [], before: 1, after: 2 })).toBe('right');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/tools/json-compare`
Expected: FAIL — cannot resolve `./logic`.

- [ ] **Step 4: Implement the logic and worker**

`src/tools/json-compare/logic.ts`:
```ts
import jsonMap from 'json-source-map';
import { toJsonPointer, type PathSegment } from '../../core/diff/paths';
import { structuralDiff, summarizeChanges, type Change, type DiffSide } from '../../core/diff/structural';
import { jsonAdapter, toPlainValue } from '../../core/formats/json';
import type { ParseError } from '../../core/formats/types';

export interface CompareOptions {
  ignoreKeyOrder: boolean;
}
export interface CompareInput {
  left: string;
  right: string;
  options: CompareOptions;
}
export type SideIssue = { kind: 'empty' } | { kind: 'invalid'; error: ParseError };
export type CompareResult =
  | { ok: true; leftText: string; rightText: string; changes: Change[] }
  | { ok: false; left: SideIssue | null; right: SideIssue | null };

type Side = { value: unknown } | { issue: SideIssue };

function parseSide(text: string): Side {
  if (text.trim() === '') return { issue: { kind: 'empty' } };
  const result = jsonAdapter.parse(text);
  return result.ok ? { value: result.value } : { issue: { kind: 'invalid', error: result.error } };
}

export function compareJson({ left, right, options }: CompareInput): CompareResult {
  const l = parseSide(left);
  const r = parseSide(right);
  if ('issue' in l || 'issue' in r) {
    return { ok: false, left: 'issue' in l ? l.issue : null, right: 'issue' in r ? r.issue : null };
  }
  const opts = { indent: 2 as const, sortKeys: options.ignoreKeyOrder };
  return {
    ok: true,
    leftText: jsonAdapter.stringify(l.value, opts),
    rightText: jsonAdapter.stringify(r.value, opts),
    changes: structuralDiff(toPlainValue(l.value), toPlainValue(r.value)),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `null` = still computing. */
export function summaryText(result: CompareResult | null): string {
  if (!result) return 'Comparing…';
  if (!result.ok) {
    const invalid = result.left?.kind === 'invalid' || result.right?.kind === 'invalid';
    return invalid ? 'Fix the JSON errors to compare' : 'Paste JSON on both sides to compare';
  }
  if (result.changes.length === 0) {
    return result.leftText === result.rightText
      ? 'No differences'
      : 'Same data — key order or number notation differs';
  }
  const s = summarizeChanges(result.changes);
  return `${plural(result.changes.length, 'change')}: ${s.added} added, ${s.removed} removed, ${s.changed} changed, ${s.moved} moved`;
}

/** 1-based line of `path` in normalized JSON text. */
export function lineOfPath(text: string, path: readonly PathSegment[]): number | undefined {
  try {
    const pointer = jsonMap.parse(text).pointers[toJsonPointer(path)];
    return pointer ? pointer.value.line + 1 : undefined;
  } catch {
    return undefined;
  }
}

export function sideOfChange(change: Change): DiffSide {
  return change.kind === 'removed' || change.kind === 'moved' ? 'left' : 'right';
}
```

`src/tools/json-compare/compare.worker.ts`:
```ts
import { exposeWorker } from '../../core/worker/expose';
import { compareJson } from './logic';

exposeWorker(compareJson);
```

- [ ] **Step 5: Run to verify the logic passes**

Run: `npx vitest run src/tools/json-compare`
Expected: PASS.

- [ ] **Step 6: Build the UI and register the tool**

`src/tools/json-compare/index.ts`:
```ts
import type { ToolDefinition } from '../types';

export const jsonCompare: ToolDefinition = {
  id: 'json-compare',
  name: 'JSON Compare',
  category: 'data',
  description: 'Compare two JSON documents as text or as structured changes.',
  keywords: ['json', 'diff', 'compare', 'changes', 'api response'],
  load: () => import('./JsonCompareTool'),
};
```

`src/tools/registry.ts`:
```ts
import { jsonCompare } from './json-compare';
import { jsonEditor } from './json-editor';
import type { ToolDefinition } from './types';

/** The only file to touch when adding a tool. */
export const tools: readonly ToolDefinition[] = [jsonEditor, jsonCompare];
```

`src/tools/json-compare/ComparePane.tsx`:
```tsx
import { useRef } from 'react';
import type { DiffSide } from '../../core/diff/structural';
import { CodeEditor } from '../../core/editor/CodeEditor';
import type { ParseError } from '../../core/formats/types';
import { useFileDrop } from '../../core/io/useFileDrop';

export function ComparePane({
  side,
  label,
  value,
  onChange,
  errors,
  onFile,
}: {
  side: DiffSide;
  label: string;
  value: string;
  onChange: (text: string) => void;
  errors: readonly ParseError[];
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { isOver, dropProps } = useFileDrop(onFile);
  return (
    <section
      className={`compare-pane${isOver ? ' is-drop-target' : ''}`}
      data-testid={`compare-${side}`}
      {...dropProps}
    >
      <div className="compare-pane__header">
        <strong>{label}</strong>
        <button type="button" onClick={() => input.current?.click()}>
          Open file
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          data-testid={`file-input-${side}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <CodeEditor value={value} onChange={onChange} language="json" errors={errors} ariaLabel={`${label} JSON`} />
    </section>
  );
}
```

`src/tools/json-compare/JsonCompareTool.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChangeList } from '../../core/diff/ChangeList';
import type { Change, DiffSide } from '../../core/diff/structural';
import { TextDiffView, type TextDiffViewHandle } from '../../core/diff/TextDiffView';
import type { ParseError } from '../../core/formats/types';
import { readFileAsText } from '../../core/io/file';
import { useAsyncValue } from '../../core/react/useAsyncValue';
import { useDebouncedValue } from '../../core/react/useDebouncedValue';
import { Banner } from '../../core/ui/Banner';
import { runInWorker, WORKER_THRESHOLD_CHARS } from '../../core/worker/runInWorker';
import { ComparePane } from './ComparePane';
import './json-compare.css';
import {
  compareJson,
  lineOfPath,
  sideOfChange,
  summaryText,
  type CompareInput,
  type CompareResult,
  type SideIssue,
} from './logic';

type Tab = 'changes' | 'text';

const createCompareWorker = () =>
  new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' });

async function compareAsync(input: CompareInput, signal: AbortSignal): Promise<CompareResult> {
  return input.left.length + input.right.length > WORKER_THRESHOLD_CHARS
    ? runInWorker<CompareInput, CompareResult>(createCompareWorker, input, { signal })
    : compareJson(input);
}

const NO_ERRORS: readonly ParseError[] = [];
const errorsOf = (issue: SideIssue | null | undefined): readonly ParseError[] =>
  issue?.kind === 'invalid' ? [issue.error] : NO_ERRORS;

export default function JsonCompareTool() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [ignoreKeyOrder, setIgnoreKeyOrder] = useState(true);
  const [tab, setTab] = useState<Tab>('changes');
  const [jump, setJump] = useState<{ side: DiffSide; line: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const diffRef = useRef<TextDiffViewHandle>(null);

  const debouncedLeft = useDebouncedValue(left, 250);
  const debouncedRight = useDebouncedValue(right, 250);
  const input = useMemo<CompareInput>(
    () => ({ left: debouncedLeft, right: debouncedRight, options: { ignoreKeyOrder } }),
    [debouncedLeft, debouncedRight, ignoreKeyOrder],
  );
  const state = useAsyncValue(input, compareAsync);
  const result = state.status === 'done' ? state.value : null;

  const leftErrors = useMemo(() => errorsOf(result && !result.ok ? result.left : null), [result]);
  const rightErrors = useMemo(() => errorsOf(result && !result.ok ? result.right : null), [result]);

  useEffect(() => {
    if (tab !== 'text' || !jump) return;
    diffRef.current?.scrollToLine(jump.side, jump.line);
    setJump(null);
  }, [tab, jump]);

  const loadInto = (setter: (text: string) => void) => async (file: File) => {
    try {
      setter(await readFileAsText(file));
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    }
  };

  const selectChange = (change: Change) => {
    if (!result?.ok) return;
    const side = sideOfChange(change);
    const line = lineOfPath(side === 'left' ? result.leftText : result.rightText, change.path);
    if (line) setJump({ side, line });
    setTab('text');
  };

  return (
    <div className="json-compare-tool">
      <div className="toolbar" role="toolbar" aria-label="Compare actions">
        <label>
          <input
            type="checkbox"
            checked={ignoreKeyOrder}
            onChange={(e) => setIgnoreKeyOrder(e.target.checked)}
          />{' '}
          Ignore key order
        </label>
        <button
          type="button"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
        >
          Swap sides
        </button>
      </div>

      {fileError && (
        <Banner kind="error" onDismiss={() => setFileError(null)}>
          {fileError}
        </Banner>
      )}

      <div className="json-compare-tool__inputs">
        <ComparePane
          side="left"
          label="Left (original)"
          value={left}
          onChange={setLeft}
          errors={leftErrors}
          onFile={(f) => void loadInto(setLeft)(f)}
        />
        <ComparePane
          side="right"
          label="Right (changed)"
          value={right}
          onChange={setRight}
          errors={rightErrors}
          onFile={(f) => void loadInto(setRight)(f)}
        />
      </div>

      <div className="json-compare-tool__result">
        <div className="toolbar">
          <div role="tablist" aria-label="Result view">
            <button type="button" role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>
              Changes
            </button>
            <button type="button" role="tab" aria-selected={tab === 'text'} onClick={() => setTab('text')}>
              Text diff
            </button>
          </div>
          {tab === 'text' && result?.ok && (
            <>
              <button type="button" aria-label="Previous change" onClick={() => diffRef.current?.prev()}>
                ↑
              </button>
              <button type="button" aria-label="Next change" onClick={() => diffRef.current?.next()}>
                ↓
              </button>
            </>
          )}
          <span className="toolbar__spacer" />
          <span data-testid="compare-summary" role="status">
            {state.status === 'error' ? `Compare failed: ${state.error.message}` : summaryText(result)}
          </span>
        </div>
        {result?.ok && tab === 'changes' && <ChangeList changes={result.changes} onSelect={selectChange} />}
        {result?.ok && tab === 'text' && (
          <TextDiffView ref={diffRef} left={result.leftText} right={result.rightText} language="json" />
        )}
      </div>
    </div>
  );
}
```

`src/tools/json-compare/json-compare.css`:
```css
.json-compare-tool { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
.json-compare-tool__inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex: 1; min-height: 160px; }
.json-compare-tool__result { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 160px; }
.compare-pane { display: flex; flex-direction: column; gap: 4px; min-height: 0; border-radius: var(--radius); }
.compare-pane.is-drop-target { outline: 2px dashed var(--accent); outline-offset: 2px; }
.compare-pane__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
@media (max-width: 720px) { .json-compare-tool__inputs { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: Write the E2E spec and exercise**

`e2e/json-compare.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { setCodeMirrorText } from './support/codemirror';

const summary = (page: Page) => page.getByTestId('compare-summary');
const fill = async (page: Page, left: string, right: string) => {
  await setCodeMirrorText(page.getByTestId('compare-left'), left);
  await setCodeMirrorText(page.getByTestId('compare-right'), right);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/json-compare');
  await expect(page.getByTestId('compare-left').locator('.cm-content')).toBeVisible();
});

test('asks for input when empty (Review Focus 4)', async ({ page }) => {
  await expect(summary(page)).toHaveText('Paste JSON on both sides to compare');
});

test('treats reordered keys as identical unless key order matters (Review Focus 5)', async ({ page }) => {
  await fill(page, '{"a":1,"b":2}', '{"b":2,"a":1}');
  await expect(summary(page)).toHaveText('No differences');
  await page.getByLabel('Ignore key order').uncheck();
  await expect(summary(page)).toHaveText('Same data — key order or number notation differs');
});

test('lists a changed value by path and jumps to it in the text diff', async ({ page }) => {
  await fill(page, '{"user":{"email":"a@x.io"}}', '{"user":{"email":"b@x.io"}}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  const item = page.getByRole('list', { name: 'Changes' }).getByRole('button');
  await expect(item).toContainText('$.user.email');
  await expect(item).toContainText('"a@x.io" → "b@x.io"');
  await item.click();
  await expect(page.getByRole('tab', { name: 'Text diff' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('text-diff-view').locator('.cm-mergeView')).toBeVisible();
  await page.getByRole('button', { name: 'Next change' }).click();
});

test('shows reordered items with ids as moves, not changes (Review Focus 5)', async ({ page }) => {
  await fill(
    page,
    '[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":3,"n":"c"}]',
    '[{"id":3,"n":"c"},{"id":1,"n":"a"},{"id":2,"n":"b"}]',
  );
  await expect(summary(page)).toContainText('0 changed');
  await expect(page.getByRole('list', { name: 'Changes' })).toContainText('Moved');
});

test('detects a one-digit change in a big integer (Review Focus 1)', async ({ page }) => {
  await fill(page, '{"id":12345678901234567890}', '{"id":12345678901234567891}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await expect(page.getByRole('list', { name: 'Changes' })).toContainText(
    '12345678901234567890 → 12345678901234567891',
  );
});

test('asks to fix invalid input', async ({ page }) => {
  await fill(page, '{"a":', '{"a":1}');
  await expect(summary(page)).toHaveText('Fix the JSON errors to compare');
});

test('swaps sides', async ({ page }) => {
  await fill(page, '{"a":1}', '{"a":1,"b":2}');
  await expect(summary(page)).toContainText('1 added');
  await page.getByRole('button', { name: 'Swap sides' }).click();
  await expect(summary(page)).toContainText('1 removed');
});

test('loads a file into one side', async ({ page }) => {
  await page.getByTestId('file-input-left').setInputFiles('fixtures/bom.json');
  await setCodeMirrorText(page.getByTestId('compare-right'), '{"source":"windows","ok":true}');
  await expect(summary(page)).toHaveText('No differences');
});
```

In `e2e/support/exercise.ts`, add to `EXERCISES`:
```ts
  'json-compare': async (page) => {
    await setCodeMirrorText(page.getByTestId('compare-left'), '{"a":1,"list":[{"id":1}]}');
    await setCodeMirrorText(page.getByTestId('compare-right'), '{"a":2,"list":[{"id":1},{"id":2}]}');
    await page.getByTestId('compare-summary').filter({ hasText: 'change' }).waitFor();
    await page.getByRole('tab', { name: 'Text diff' }).click();
    await page.getByTestId('text-diff-view').waitFor();
  },
```

- [ ] **Step 8: Run everything**

Run: `npm run verify && npm run e2e`
Expected: PASS; the bundle check lists both tool routes within budget; registry smoke and no-egress cover JSON Compare automatically.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(json-compare): add JSON Compare tool with structural and text diff"
```

---

### Task 17: Performance budgets and CSP-safe transform queries

**Files:**
- Create: `e2e/support/generate.ts`, `e2e/perf.spec.ts`
- Modify: `e2e/container/headers.spec.ts`

**Interfaces:**
- Consumes: DOM contracts from Tasks 14 and 16.
- Produces: `makeLargeJson(targetBytes: number): string`; `perf` project assertions for the two time budgets, scaled by `PERF_MARGIN` (default `1`; CI sets `2`).

- [ ] **Step 1: Write the generator and perf spec**

`e2e/support/generate.ts`:
```ts
/** Realistic API-style array of objects, roughly `targetBytes` long. */
export function makeLargeJson(targetBytes: number): string {
  const parts: string[] = [];
  let size = 2;
  for (let i = 0; size < targetBytes; i++) {
    const item = JSON.stringify({
      id: i,
      name: `user-${i}`,
      email: `user${i}@example.com`,
      active: i % 2 === 0,
      score: i * 1.5,
      tags: ['alpha', 'beta', 'gamma'],
      address: { city: 'Springfield', zip: String(10000 + (i % 89999)) },
    });
    parts.push(item);
    size += item.length + 1;
  }
  return `[${parts.join(',')}]`;
}
```

`e2e/perf.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { makeLargeJson } from './support/generate';

const MB = 1024 * 1024;
const MARGIN = Number(process.env.PERF_MARGIN ?? '1');
const budget = (ms: number) => ms * MARGIN;

test.setTimeout(120_000);

test('opens a 20 MB JSON file in text mode within budget', async ({ page }) => {
  const json = makeLargeJson(20 * MB);
  await page.goto('/#/tools/json-editor');
  await expect(page.getByTestId('json-editor-view').locator('.cm-content')).toBeVisible();

  const started = Date.now();
  await page.getByTestId('file-input').setInputFiles({
    name: 'big.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const openAnyway = page.getByRole('button', { name: /open anyway/i });
  if (await openAnyway.isVisible().catch(() => false)) await openAnyway.click();
  await expect(page.getByTestId('status-bar')).toContainText('Valid JSON', { timeout: 30_000 });
  const elapsed = Date.now() - started;

  console.log(`20 MB open: ${elapsed} ms (budget ${budget(3000)} ms)`);
  expect(elapsed).toBeLessThan(budget(3000));
});

test('compares two 5 MB documents within budget and keeps the UI responsive', async ({ page }) => {
  const left = makeLargeJson(5 * MB);
  const right = left
    .replace('"user500@example.com"', '"changed@example.com"')
    .replace('"user-1500"', '"renamed"');
  await page.goto('/#/tools/json-compare');
  await expect(page.getByTestId('compare-left').locator('.cm-content')).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __maxFrameGap: number };
    w.__maxFrameGap = 0;
    let last = performance.now();
    const tick = (now: number) => {
      w.__maxFrameGap = Math.max(w.__maxFrameGap, now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const started = Date.now();
  await page
    .getByTestId('file-input-left')
    .setInputFiles({ name: 'l.json', mimeType: 'application/json', buffer: Buffer.from(left) });
  await page
    .getByTestId('file-input-right')
    .setInputFiles({ name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(right) });
  await expect(page.getByTestId('compare-summary')).toHaveText(
    '2 changes: 0 added, 0 removed, 2 changed, 0 moved',
    { timeout: 30_000 },
  );
  const elapsed = Date.now() - started;
  const maxGap = await page.evaluate(
    () => (window as unknown as { __maxFrameGap: number }).__maxFrameGap,
  );

  console.log(
    `5 MB compare: ${elapsed} ms (budget ${budget(3000)} ms), max frame gap ${Math.round(maxGap)} ms`,
  );
  expect(elapsed).toBeLessThan(budget(3000));
  expect(maxGap).toBeLessThan(budget(1000));
});
```

- [ ] **Step 2: Run the perf project**

Run: `npm run e2e:perf`
Expected: 2 tests PASS with timings printed. If a budget fails, profile with the Chrome DevTools Performance panel on `npm run preview` before changing anything; report the measured numbers to the user — budgets change only with their agreement.

- [ ] **Step 3: Exercise the transform modal under the real CSP**

In `e2e/container/headers.spec.ts`, add after the existing CSP test:
```ts
test('transform queries run without CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto('/#/tools/json-editor');
  const editor = page.getByTestId('json-editor-view');
  await editor.locator('.cm-content').click();
  await page.keyboard.insertText('{"items":[{"id":1},{"id":2}]}');
  await editor.getByRole('button', { name: /transform/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const language of ['JSONQuery', 'JMESPath', 'JSONPath']) {
    const option = dialog.getByRole('button', { name: new RegExp(language, 'i') });
    if (await option.isVisible().catch(() => false)) await option.click();
  }
  await page.keyboard.press('Escape');
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});
```

Run: `docker compose up --build -d && BASE_URL=http://localhost:8080 npm run e2e:container; docker compose down`
Expected: 5 tests PASS. If the transform button or dialog selectors differ, find them with `npx playwright codegen http://localhost:8080/#/tools/json-editor` and propose the selector change to the user; edit the spec only after they confirm.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "test: enforce performance budgets and CSP-safe transform queries"
```

---

### Task 18: Release pipeline, GitHub Pages demo, and README

**Files:**
- Create: `build/csp.ts`, `build/csp.test.ts`, `.github/workflows/release.yml`, `README.md`
- Modify: `vite.config.ts` (add the Pages CSP plugin)

**Interfaces:**
- Consumes: everything above; `docker/security-headers.conf` (Task 6).
- Produces: `CSP_DIRECTIVES: readonly string[]`, `metaCsp(): string`, `pagesCspPlugin(): Plugin` (injects a CSP `<meta>` only when `QA_TOOLBOX_TARGET=pages`); a tag-triggered release that publishes the multi-arch image, deploys Pages, and creates a GitHub Release.

- [ ] **Step 1: Write the failing CSP tests**

`build/csp.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, metaCsp } from './csp';

const directives = (csp: string) =>
  new Set(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean),
  );

describe('CSP', () => {
  it('matches the nginx header exactly (no drift between Docker and Pages)', () => {
    const conf = readFileSync(
      fileURLToPath(new URL('../docker/security-headers.conf', import.meta.url)),
      'utf8',
    );
    const header = /Content-Security-Policy "([^"]+)"/.exec(conf)?.[1];
    expect(header).toBeDefined();
    expect(directives(header!)).toEqual(new Set(CSP_DIRECTIVES));
  });

  it('drops frame-ancestors for the meta tag, which browsers ignore there', () => {
    expect(metaCsp()).not.toContain('frame-ancestors');
    expect(metaCsp()).toContain("connect-src 'self'");
  });
});
```

Run: `npx vitest run build`
Expected: FAIL — cannot resolve `./csp`.

- [ ] **Step 2: Implement the CSP module and wire it into Vite**

`build/csp.ts`:
```ts
import type { Plugin } from 'vite';

/** Must equal docker/security-headers.conf (enforced by csp.test.ts). */
export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

export function metaCsp(): string {
  return CSP_DIRECTIVES.filter((d) => !d.startsWith('frame-ancestors')).join('; ');
}

/** GitHub Pages can't set headers, so the Pages build carries the CSP as a <meta> tag. */
export function pagesCspPlugin(): Plugin {
  return {
    name: 'qa-toolbox-pages-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (process.env.QA_TOOLBOX_TARGET !== 'pages') return html;
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp()}" />`,
      );
    },
  };
}
```

In `vite.config.ts`, add `import { pagesCspPlugin } from './build/csp';` and change `plugins: [react()]` to `plugins: [react(), pagesCspPlugin()]`.

Run: `npx vitest run build && QA_TOOLBOX_TARGET=pages npm run build && grep -c 'Content-Security-Policy' dist/index.html; npm run build && grep -c 'Content-Security-Policy' dist/index.html`
Expected: tests PASS; the first grep prints `1`, the second prints `0`.

- [ ] **Step 3: Write the release workflow**

`.github/workflows/release.yml`:
```yaml
name: Release
on:
  push:
    tags: ['v*.*.*']
permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run verify

  image:
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/qa-toolbox
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  pages:
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run build
        env: { QA_TOOLBOX_TARGET: pages }
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deploy
        uses: actions/deploy-pages@v4

  release:
    needs: [image, pages]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - run: gh release create "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --generate-notes
        env: { GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```
Then pin every `uses:` to a commit SHA exactly as in Task 7 Step 4, and run actionlint (Task 7 Step 5). Expected: no errors.

- [ ] **Step 4: Write the README**

`README.md`:
````markdown
# qa-toolbox

A private, offline toolbox for developers and QA engineers. Everything runs in your browser — pasted data never leaves your machine, not even to the container serving the app.

**v1 tools:** JSON Editor (text / tree / table, format, minify, sort keys, repair, JSONQuery / JMESPath / JSONPath, JSON Schema validation) and JSON Compare (structural changes + side-by-side text diff).

## Run it

```bash
docker run --rm -p 8080:8080 ghcr.io/<owner>/qa-toolbox
```
Open http://localhost:8080. Works on amd64 and arm64 (Apple Silicon).

Hardened mode (read-only filesystem):
```bash
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp ghcr.io/<owner>/qa-toolbox
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

Push a tag `vX.Y.Z`. CI publishes `ghcr.io/<owner>/qa-toolbox:{X.Y.Z,latest}` (amd64 + arm64), deploys the Pages demo, and creates a GitHub Release with generated notes.
````

- [ ] **Step 5: Final verification**

Run: `npm run verify && npm run e2e && npm run e2e:perf && docker compose up --build -d && BASE_URL=http://localhost:8080 npm run e2e:container; docker compose down`
Expected: every command PASSES.

Then check intent.md §1's success criteria by hand:
1. `docker run --rm -p 8080:8080 qa-toolbox:local`, turn networking off, and use every JSON Editor and JSON Compare feature. Expected: all work.
2. Read "Adding a tool" and confirm it needs one folder plus one registry line.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "ci: add release pipeline, Pages demo with meta CSP, and README"
```

---

## Spec Coverage Map

| intent.md section | Task(s) |
|---|---|
| §1 Success criterion 1 (offline Docker run) | 6, 14, 16, 18 |
| §1 Success criterion 2 (one folder + one line) | 3, 5 (auto-discovery), 18 (README) |
| §1 Success criterion 3 (privacy proven in CI) | 5, 6, 17 |
| §1 Success criterion 4 (budgets in CI) | 7, 17 |
| §2 Architecture, layout, dependency rules | 1, 2, 3, 4 |
| §3.1 ToolDefinition / registry | 3 |
| §3.2 FormatAdapter | 9 |
| §3.3 Shared core | 10, 11, 12, 13, 15 |
| §3.4 App shell | 4 |
| §4.1 JSON Editor | 13, 14 |
| §4.2 JSON Compare | 15, 16 |
| §4.3 Data flow | 11, 14, 16 |
| §5 Error handling | 4 (boundary), 9 (ParseResult), 14 and 16 (banners, inline errors) |
| §6.1 Offline & privacy | 5, 17 |
| §6.2 Performance budgets | 7, 17 |
| §6.3 Security | 6, 7, 8, 18 |
| §7 Testing strategy | every task; 5, 6, 17 |
| §8 Delivery | 6, 7, 18 |
| §9 Roadmap | out of scope for this plan (each milestone gets its own plan) |
| §10 Risks | 8 (validator), 6 and 17 (CSP), 7/12/13 (dedupe), 2 and 13 (library isolation), 17 (perf flakiness) |
