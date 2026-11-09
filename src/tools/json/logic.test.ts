import { describe, expect, it } from 'vitest';
import type { Change } from '../../core/diff/structural';
import {
  MAX_HIGHLIGHTED_CHANGES,
  applyEdit,
  changeTargets,
  compareAvailability,
  compareJson,
  computeStatus,
  highlightsFor,
  lineOfPath,
  parseIndentChoice,
  sideOfChange,
  splitFromKey,
  splitFromPointer,
  statusLabel,
  summaryText,
} from './logic';

describe('computeStatus', () => {
  it('is empty for blank input, not an error (Review Focus 4)', () => {
    expect(computeStatus('  \n ')).toEqual({ state: 'empty' });
    expect(statusLabel({ state: 'empty' })).toBe('Empty — paste, type, or drop a JSON file');
  });

  it('reports size and node count for valid JSON', () => {
    const status = computeStatus('{"a":[1,2]}');
    expect(status).toEqual({ state: 'valid', bytes: 11, nodes: 4 });
    expect(statusLabel(status)).toBe('Valid JSON · 11 B · 4 nodes');
  });

  it('reports the parse error position', () => {
    const status = computeStatus('{"a":1,}');
    expect(status.state).toBe('invalid');
    expect(statusLabel(status)).toMatch(/^Invalid JSON: .+ \(line 1, column 8\)$/);
  });
});

describe('parseIndentChoice', () => {
  it('maps select values', () => {
    expect(parseIndentChoice('2')).toBe(2);
    expect(parseIndentChoice('4')).toBe(4);
    expect(parseIndentChoice('tab')).toBe('\t');
    expect(parseIndentChoice('nonsense')).toBe(2);
  });
});

describe('applyEdit', () => {
  it('formats with the chosen indentation', () => {
    expect(applyEdit('[1]', { kind: 'format', indent: 4 })).toEqual({
      ok: true,
      text: '[\n    1\n]',
    });
  });

  it('minifies', () => {
    expect(applyEdit('{ "a" : [ 1 ] }', { kind: 'minify' })).toEqual({
      ok: true,
      text: '{"a":[1]}',
    });
  });

  it('sorts keys recursively and keeps big numbers (Review Focus 1)', () => {
    const r = applyEdit('{"b":1,"a":{"d":[1,2],"c":12345678901234567890}}', {
      kind: 'sortKeys',
      indent: 2,
    });
    expect(r.ok && r.text).toBe(
      '{\n  "a": {\n    "c": 12345678901234567890,\n    "d": [\n      1,\n      2\n    ]\n  },\n  "b": 1\n}',
    );
  });

  it('repairs broken JSON', () => {
    expect(applyEdit("{a:'x',}", { kind: 'repair' })).toEqual({ ok: true, text: '{"a":"x"}' });
  });

  it('returns the parse error instead of formatting invalid JSON', () => {
    expect(applyEdit('{"a":', { kind: 'format', indent: 2 }).ok).toBe(false);
  });
});

const compare = (left: string, right: string) => compareJson({ left, right });

describe('compareJson', () => {
  it('asks for input when a side is empty (Review Focus 4)', () => {
    const result = compare('', '{"a":1}');
    expect(result).toEqual({ ok: false, left: { kind: 'empty' }, right: null });
    expect(summaryText(result)).toBe('Paste JSON on both sides to compare');
  });

  it('reports invalid sides with their parse errors', () => {
    const result = compare('{"a":', '{"a":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.left).toMatchObject({ kind: 'invalid', error: { line: 1 } });
    expect(summaryText(result)).toBe('Fix the JSON errors to compare');
  });

  it('says identical when only formatting and key order differ (Review Focus 5)', () => {
    const result = compare('{"a":1,"b":[1,2]}', '{\n  "b": [1, 2],\n  "a": 1\n}');
    expect(result.ok && result.changes).toEqual([]);
    expect(summaryText(result)).toBe('No differences');
  });

  it('distinguishes data-equal but text-different documents', () => {
    expect(summaryText(compare('{"a":1.0}', '{"a":1}'))).toBe(
      'Same data — key order or number notation differs',
    );
  });

  it('normalizes both sides to 2-space JSON with sorted keys', () => {
    const result = compare('{"b":1,"a":2}', '{"a":2}');
    if (!result.ok) throw new Error('expected ok');
    expect(result.leftText).toBe('{\n  "a": 2,\n  "b": 1\n}');
    expect(result.rightText).toBe('{\n  "a": 2\n}');
  });

  it('summarizes changes with correct plurals', () => {
    expect(summaryText(compare('{"a":1}', '{"a":2}'))).toBe(
      '1 change: 0 added, 0 removed, 1 changed, 0 moved',
    );
    expect(summaryText(compare('{"a":1}', '{"a":2,"b":3}'))).toBe(
      '2 changes: 1 added, 0 removed, 1 changed, 0 moved',
    );
  });

  it('detects a one-digit change in a big integer (Review Focus 1)', () => {
    const result = compare('{"id":12345678901234567890}', '{"id":12345678901234567891}');
    expect(result.ok && result.changes).toEqual([
      {
        kind: 'changed',
        path: ['id'],
        before: 12345678901234567890n,
        after: 12345678901234567891n,
      },
    ]);
  });
});

describe('summaryText', () => {
  it('handles the pending state', () => {
    expect(summaryText(null)).toBe('Comparing…');
  });
});

describe('lineOfPath', () => {
  const text = '{\n  "a": 1,\n  "users": [\n    {\n      "email": "x"\n    }\n  ]\n}';
  it('finds the 1-based line of a path', () => {
    expect(lineOfPath(text, [])).toBe(1);
    expect(lineOfPath(text, ['a'])).toBe(2);
    expect(lineOfPath(text, ['users', 0, 'email'])).toBe(5);
  });
  it('returns undefined for missing paths or invalid text', () => {
    expect(lineOfPath(text, ['nope'])).toBeUndefined();
    expect(lineOfPath('{', ['a'])).toBeUndefined();
  });
});

describe('sideOfChange', () => {
  it('locates removals and moves on the left, others on the right', () => {
    expect(sideOfChange({ kind: 'removed', path: [], before: 1 })).toBe('left');
    expect(sideOfChange({ kind: 'moved', path: [0], toIndex: 1 })).toBe('left');
    expect(sideOfChange({ kind: 'added', path: [], after: 1 })).toBe('right');
    expect(sideOfChange({ kind: 'changed', path: [], before: 1, after: 2 })).toBe('right');
  });
});

describe('compareJson number literals', () => {
  it('distinguishes a long decimal number from a string with the same digits', () => {
    const result = compare('{"a":0.12345678901234567890123}', '{"a":"0.12345678901234567890123"}');
    expect(result.ok && result.changes).toHaveLength(1);
  });

  it('reports no change for equal long decimals and one change for different ones', () => {
    const same = compare('[0.12345678901234567890123]', '[0.12345678901234567890123]');
    expect(same.ok && same.changes).toHaveLength(0);
    const diff = compare('[0.12345678901234567890123]', '[0.12345678901234567890124]');
    expect(diff.ok && diff.changes).toMatchObject([{ kind: 'changed', path: [0] }]);
  });
});

describe('merged tool additions', () => {
  it('reports no differences when only key order differs', () => {
    expect(summaryText(compareJson({ left: '{"b":1,"a":2}', right: '{"a":2,"b":1}' }))).toBe(
      'No differences',
    );
  });

  it('compareAvailability: empty wins over invalid', () => {
    expect(compareAvailability(computeStatus(''), computeStatus('{'))).toEqual({
      ok: false,
      reason: 'Paste JSON on both sides to compare',
    });
    expect(compareAvailability(computeStatus('{}'), computeStatus('{'))).toEqual({
      ok: false,
      reason: 'Fix the JSON errors to compare',
    });
    expect(compareAvailability(computeStatus('{}'), computeStatus('[]'))).toEqual({ ok: true });
  });

  it('highlightsFor marks changed on both sides and ancestors', () => {
    const h = highlightsFor([
      { kind: 'changed', path: ['user', 'email'], before: 'a', after: 'b' },
    ]);
    for (const map of [h.left, h.right]) {
      expect(map.get('/user/email')).toBe('changed');
      expect(map.get('/user')).toBe('ancestor');
    }
    expect(h.total).toBe(1);
    expect(h.truncated).toBe(false);
  });

  it('highlightsFor places removed left, added right, moved on both', () => {
    const h = highlightsFor([
      { kind: 'removed', path: ['a'], before: 1 },
      { kind: 'added', path: ['b'], after: 1 },
      { kind: 'moved', path: ['l', 0], toIndex: 2 },
    ]);
    expect(h.left.get('/a')).toBe('removed');
    expect(h.right.has('/a')).toBe(false);
    expect(h.right.get('/b')).toBe('added');
    expect(h.left.has('/b')).toBe(false);
    expect(h.left.get('/l/0')).toBe('moved');
    expect(h.right.get('/l/2')).toBe('moved');
    expect(h.left.get('/l')).toBe('ancestor');
    expect(h.right.get('/l')).toBe('ancestor');
  });

  it('ancestors never override a real highlight', () => {
    const h = highlightsFor([
      { kind: 'added', path: ['a', 'b'], after: 1 },
      { kind: 'added', path: ['a'], after: {} },
    ]);
    expect(h.right.get('/a')).toBe('added');
  });

  it('highlightsFor caps at MAX_HIGHLIGHTED_CHANGES', () => {
    const changes: Change[] = Array.from({ length: 10_001 }, (_, i) => ({
      kind: 'added',
      path: [i],
      after: i,
    }));
    const h = highlightsFor(changes);
    expect(MAX_HIGHLIGHTED_CHANGES).toBe(10_000);
    expect(h.truncated).toBe(true);
    expect(h.total).toBe(10_001);
    expect([...h.right.values()].filter((k) => k === 'added')).toHaveLength(10_000);
  });

  it('splitFromPointer converts and snaps', () => {
    expect(splitFromPointer(100, 1000)).toBe(0);
    expect(splitFromPointer(500, 1000)).toBe(50);
    expect(splitFromPointer(200, 1000)).toBe(24);
    expect(splitFromPointer(950, 1000)).toBe(100);
  });

  it('splitFromKey steps and jumps', () => {
    expect(splitFromKey(50, 'ArrowLeft')).toBe(45);
    expect(splitFromKey(50, 'ArrowRight')).toBe(55);
    expect(splitFromKey(30, 'Home')).toBe(0);
    expect(splitFromKey(30, 'End')).toBe(100);
    expect(splitFromKey(100, 'Enter')).toBe(50);
    expect(splitFromKey(2, 'ArrowLeft')).toBe(0);
    expect(splitFromKey(98, 'ArrowRight')).toBe(100);
  });
});

describe('changeTargets', () => {
  it('outlines a changed value on both sides', () => {
    const t = changeTargets({ kind: 'changed', path: ['a', 'b'], before: 1, after: 2 });
    expect(t.left).toEqual({ focus: ['a', 'b'], scroll: ['a', 'b'] });
    expect(t.right).toEqual({ focus: ['a', 'b'], scroll: ['a', 'b'] });
  });

  it('scrolls the side without the value to its parent', () => {
    const added = changeTargets({ kind: 'added', path: ['list', 2], after: 1 });
    expect(added.left).toEqual({ focus: null, scroll: ['list'] });
    expect(added.right).toEqual({ focus: ['list', 2], scroll: ['list', 2] });
    const removed = changeTargets({ kind: 'removed', path: ['x'], before: 1 });
    expect(removed.left).toEqual({ focus: ['x'], scroll: ['x'] });
    expect(removed.right).toEqual({ focus: null, scroll: null });
  });

  it('follows a moved item to its new index on the right', () => {
    const t = changeTargets({ kind: 'moved', path: ['list', 0], toIndex: 2 });
    expect(t.left.focus).toEqual(['list', 0]);
    expect(t.right.focus).toEqual(['list', 2]);
  });
});

describe('highlights and targets inside arrays use each side’s own index', () => {
  const REPRO_LEFT = '{"items":[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":4,"n":"d"}]}';
  const REPRO_RIGHT = '{"items":[{"id":3,"n":"c"},{"id":1,"n":"a"},{"id":2,"n":"B"}]}';
  const changesOf = (left: string, right: string) => {
    const result = compareJson({ left, right });
    if (!result.ok) throw new Error('expected valid input');
    return result.changes;
  };

  it('insertion before a change: the left highlight sits on the left item', () => {
    const h = highlightsFor(changesOf(REPRO_LEFT, REPRO_RIGHT));
    expect(h.left.get('/items/1/n')).toBe('changed');
    expect(h.left.get('/items/2/n')).toBeUndefined();
    expect(h.left.get('/items/2')).toBe('removed');
    expect(h.right.get('/items/2/n')).toBe('changed');
    expect(h.right.get('/items/0')).toBe('added');
  });

  it('removal before a change: focus and scroll follow the left item', () => {
    const changes = changesOf('[{"id":1,"n":"a"},{"id":2,"n":"b"}]', '[{"id":2,"n":"B"}]');
    const changed = changes.find((c) => c.kind === 'changed')!;
    const t = changeTargets(changed);
    expect(t.left).toEqual({ focus: [1, 'n'], scroll: [1, 'n'] });
    expect(t.right).toEqual({ focus: [0, 'n'], scroll: [0, 'n'] });
    const h = highlightsFor(changes);
    expect(h.left.get('/1/n')).toBe('changed');
    expect(h.left.get('/0')).toBe('removed');
    expect(h.right.get('/0/n')).toBe('changed');
  });

  it('a moved and modified item is highlighted at its own index on each side', () => {
    const changes = changesOf(
      '[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":3,"n":"c"}]',
      '[{"id":3,"n":"C"},{"id":1,"n":"a"},{"id":2,"n":"b"}]',
    );
    const h = highlightsFor(changes);
    expect(h.left.get('/2')).toBe('moved');
    expect(h.left.get('/2/n')).toBe('changed');
    expect(h.left.get('/0/n')).toBeUndefined();
    expect(h.right.get('/0')).toBe('moved');
    expect(h.right.get('/0/n')).toBe('changed');
    const changed = changes.find((c) => c.kind === 'changed')!;
    expect(changeTargets(changed).left.focus).toEqual([2, 'n']);
  });

  it('a value absent on one side scrolls that side to its own parent', () => {
    const changes = changesOf(
      '{"a":[{"id":1,"l":[1]},{"id":2,"l":[1,2]}]}',
      '{"a":[{"id":0},{"id":1,"l":[1]},{"id":2,"l":[1]}]}',
    );
    const removed = changes.find((c) => c.kind === 'removed')!;
    const t = changeTargets(removed);
    expect(t.left.focus).toEqual(['a', 1, 'l', 1]);
    expect(t.right).toEqual({ focus: null, scroll: ['a', 2, 'l'] });
  });

  it('a move never overwrites an added, removed or changed highlight at the same pointer', () => {
    const moved: Change = { kind: 'moved', path: ['l', 3], toIndex: 0 };
    const changed: Change = { kind: 'changed', path: ['l', 0], before: 1, after: 2 };
    const added: Change = { kind: 'added', path: ['l', 0], after: 1 };
    const removed: Change = { kind: 'removed', path: ['l', 3], before: 1 };
    expect(highlightsFor([changed, moved]).right.get('/l/0')).toBe('changed');
    expect(highlightsFor([moved, changed]).right.get('/l/0')).toBe('changed');
    expect(highlightsFor([added, moved]).right.get('/l/0')).toBe('added');
    expect(highlightsFor([moved, added]).right.get('/l/0')).toBe('added');
    expect(highlightsFor([removed, moved]).left.get('/l/3')).toBe('removed');
    expect(highlightsFor([moved, removed]).left.get('/l/3')).toBe('removed');
  });
});
