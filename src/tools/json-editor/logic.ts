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
