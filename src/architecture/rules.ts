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
const TOOL_TARGET_RE = /^src\/tools\/([^/]+)(\/|$)/;
/** Top-level modules in src/tools/ that every tool may import (they are not tools). */
const SHARED_TOOL_MODULES = new Set(['types']);
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

      if (path.startsWith('src/core/') && resolved && /^src\/(tools|app)(\/|$)/.test(resolved)) {
        add('core-isolation');
      }
      const targetTool = resolved ? TOOL_TARGET_RE.exec(resolved)?.[1] : undefined;
      const targetIsShared = targetTool !== undefined && SHARED_TOOL_MODULES.has(targetTool);
      if (ownTool && targetTool && !targetIsShared && ownTool !== targetTool) add('tool-isolation');
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
