import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIsDarkTheme } from './useIsDarkTheme';

describe('useIsDarkTheme', () => {
  it('follows the data-theme attribute', async () => {
    document.documentElement.dataset.theme = 'light';
    const { result } = renderHook(() => useIsDarkTheme());
    expect(result.current).toBe(false);
    act(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
