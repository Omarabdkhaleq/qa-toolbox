// @vitest-environment node
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
