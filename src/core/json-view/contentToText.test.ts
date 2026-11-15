import { describe, expect, it } from 'vitest';
import { contentToText } from './JsonEditorView';

describe('contentToText', () => {
  it('returns text content unchanged', () => {
    expect(contentToText({ text: '{"a":1,}' })).toBe('{"a":1,}');
  });

  it('serialises parsed json content with 2-space indent, keeping big numbers', () => {
    expect(contentToText({ json: { a: [1] } })).toBe('{\n  "a": [\n    1\n  ]\n}');
  });
});
