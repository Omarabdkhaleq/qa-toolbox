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
