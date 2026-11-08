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
