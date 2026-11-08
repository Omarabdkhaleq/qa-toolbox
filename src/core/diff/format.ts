import { NumberLiteral } from './numberLiteral';
import type { Change, ChangeKind } from './structural';

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  moved: 'Moved',
};

// Previews only: a bigint nested inside an object is shown approximately. A changed bigint value itself
// is formatted exactly by the bigint branch below, and the text diff always shows exact text.
const bigintSafe = (_key: string, value: unknown) =>
  typeof value === 'bigint'
    ? Number(value)
    : value instanceof NumberLiteral
      ? Number(value.literal)
      : value;

export function formatValue(value: unknown, maxLength = 80): string {
  const text =
    typeof value === 'bigint' || value instanceof NumberLiteral
      ? value.toString()
      : typeof value === 'string'
        ? JSON.stringify(value)
        : (JSON.stringify(value, bigintSafe) ?? String(value));
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function describeChange(change: Change): string {
  switch (change.kind) {
    case 'added':
      return formatValue(change.after);
    case 'removed':
      return formatValue(change.before);
    case 'changed':
      return `${formatValue(change.before, 40)} → ${formatValue(change.after, 40)}`;
    case 'moved':
      return `to index ${change.toIndex}`;
  }
}
