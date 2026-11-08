export type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function toJsonPath(path: readonly PathSegment[]): string {
  return (
    '$' +
    path
      .map((s) =>
        typeof s === 'number' ? `[${s}]` : IDENTIFIER.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`,
      )
      .join('')
  );
}

export function toJsonPointer(path: readonly PathSegment[]): string {
  return path.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}
