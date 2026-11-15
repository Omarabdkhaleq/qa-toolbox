import type { ParseError } from './types';

export function describeParseError(error: ParseError): string {
  return error.line
    ? `${error.message} (line ${error.line}, column ${error.column ?? 1})`
    : error.message;
}
