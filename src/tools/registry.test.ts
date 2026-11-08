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
