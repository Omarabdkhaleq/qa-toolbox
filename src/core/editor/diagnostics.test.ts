import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { errorsToDiagnostics } from './diagnostics';

const doc = Text.of(['{', '  "a": 1', '  "b"', '}']);

describe('errorsToDiagnostics', () => {
  it('maps 1-based line/column to a document offset', () => {
    const [d] = errorsToDiagnostics(doc, [{ message: 'Colon expected', line: 3, column: 6 }]);
    expect(d).toMatchObject({
      from: doc.line(3).from + 5,
      severity: 'error',
      message: 'Colon expected',
    });
    expect(d!.to).toBe(d!.from + 1);
  });

  it('clamps out-of-range positions and defaults missing ones to 1:1', () => {
    const [far, none] = errorsToDiagnostics(doc, [
      { message: 'x', line: 99, column: 99 },
      { message: 'y' },
    ]);
    expect(far!.from).toBe(doc.line(4).to);
    expect(far!.to).toBe(doc.length);
    expect(none!.from).toBe(0);
  });
});
