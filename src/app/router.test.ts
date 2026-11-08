import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseRoute, toolHref, useHashLocation } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { kind: 'home' }],
    ['#', { kind: 'home' }],
    ['#/', { kind: 'home' }],
    ['#/tools/json-editor', { kind: 'tool', toolId: 'json-editor' }],
    ['#/tools/json-editor/', { kind: 'tool', toolId: 'json-editor' }],
    ['#/nope', { kind: 'unknown', path: '/nope' }],
    ['#/tools/Bad_Id', { kind: 'unknown', path: '/tools/Bad_Id' }],
  ])('parses %j', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });
});

describe('toolHref', () => {
  it('builds a hash route', () => {
    expect(toolHref('json-editor')).toBe('#/tools/json-editor');
  });
});

describe('useHashLocation', () => {
  it('tracks hash changes', () => {
    window.location.hash = '#/a';
    const { result } = renderHook(() => useHashLocation());
    expect(result.current).toBe('#/a');
    act(() => {
      window.location.hash = '#/b';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('#/b');
  });
});
