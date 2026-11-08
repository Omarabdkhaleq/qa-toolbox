export type FormatId = 'json'; // grows: 'xml' | 'csv' | 'yaml' | 'toml'

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: ParseError };

export interface FormatAdapter<Opts = unknown> {
  id: FormatId;
  label: string;
  /** Never throws. */
  parse(text: string): ParseResult;
  stringify(value: unknown, opts?: Opts): string;
}
