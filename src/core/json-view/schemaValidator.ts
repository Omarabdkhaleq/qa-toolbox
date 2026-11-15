import {
  Validator as SchemaEngine,
  type OutputUnit,
  type Schema,
  type SchemaDraft,
} from '@cfworker/json-schema';
import { ValidationSeverity, type ValidationError, type Validator } from 'vanilla-jsoneditor';
import { jsonAdapter, toPlainValue } from '../formats/json';

export type JsonValidator = Validator;
export type SchemaValidatorResult =
  { ok: true; validator: JsonValidator } | { ok: false; error: string };

/** Parent-level errors that only repeat a more specific child error. */
const NOISE_KEYWORDS = new Set([
  'properties',
  'items',
  'prefixItems',
  'patternProperties',
  'additionalItems',
  '$ref',
  '$dynamicRef',
  '$recursiveRef',
  'allOf',
  'then',
  'else',
  'dependentSchemas',
  'false',
]);

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function detectDraft(schema: unknown): SchemaDraft {
  const uri =
    schema !== null && typeof schema === 'object'
      ? String((schema as Record<string, unknown>).$schema ?? '')
      : '';
  if (uri.includes('draft-04')) return '4';
  if (uri.includes('draft-06') || uri.includes('draft-07')) return '7';
  if (uri.includes('2019-09')) return '2019-09';
  return '2020-12';
}

export function pointerToPath(pointer: string): string[] {
  const p = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  if (p === '') return [];
  return p
    .slice(1)
    .split('/')
    .map((segment) => decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function toValidationErrors(units: OutputUnit[]): ValidationError[] {
  const seen = new Set<string>();
  const out: ValidationError[] = [];
  for (const unit of units) {
    if (NOISE_KEYWORDS.has(unit.keyword)) continue;
    const key = `${unit.instanceLocation}\u0000${unit.error}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      path: pointerToPath(unit.instanceLocation),
      message: unit.error,
      severity: ValidationSeverity.error,
    });
  }
  return out;
}

export function createSchemaValidator(schemaText: string): SchemaValidatorResult | null {
  if (schemaText.trim() === '') return null;
  const parsed = jsonAdapter.parse(schemaText);
  if (!parsed.ok) return { ok: false, error: `Schema is not valid JSON: ${parsed.error.message}` };
  const schema = toPlainValue(parsed.value, 'approximate');
  const isObject = schema !== null && typeof schema === 'object' && !Array.isArray(schema);
  if (typeof schema !== 'boolean' && !isObject) {
    return { ok: false, error: 'Schema must be a JSON object or boolean' };
  }

  let engine: SchemaEngine;
  try {
    engine = new SchemaEngine(schema as Schema | boolean, detectDraft(schema), false);
  } catch (err) {
    return { ok: false, error: `Schema error: ${messageOf(err)}` };
  }

  const validator: JsonValidator = (json) => {
    try {
      const result = engine.validate(toPlainValue(json, 'approximate'));
      return result.valid ? [] : toValidationErrors(result.errors);
    } catch (err) {
      return [
        {
          path: [],
          message: `Schema error: ${messageOf(err)}`,
          severity: ValidationSeverity.error,
        },
      ];
    }
  };
  return { ok: true, validator };
}
