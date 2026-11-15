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
