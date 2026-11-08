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
    const result = createSchemaValidator(
      '{"type":"object","properties":{"id":{"type":"integer"}}}',
    );
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
      {
        keyword: 'type',
        keywordLocation: '#/properties/a/type',
        instanceLocation: '#/a',
        error: 'Wrong type',
      },
      {
        keyword: 'type',
        keywordLocation: '#/properties/a/type',
        instanceLocation: '#/a',
        error: 'Wrong type',
      },
    ]);
    expect(errors).toEqual([{ path: ['a'], message: 'Wrong type', severity: 'error' }]);
  });
});
