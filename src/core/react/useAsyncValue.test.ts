import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAsyncValue } from './useAsyncValue';

const double = async (n: number) => n * 2;
const fail = async (_n: number): Promise<number> => {
  throw new Error('broken');
};
const slowEcho = (n: number, signal: AbortSignal) =>
  new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => resolve(n), n);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

describe('useAsyncValue', () => {
  it('goes from pending to done', async () => {
    const { result } = renderHook(() => useAsyncValue(2, double));
    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current).toEqual({ status: 'done', value: 4 }));
  });

  it('reports errors', async () => {
    const { result } = renderHook(() => useAsyncValue(0, fail));
    await waitFor(() => expect(result.current.status).toBe('error'));
    if (result.current.status === 'error') expect(result.current.error.message).toBe('broken');
  });

  it('drops stale results and keeps the previous value while recomputing', async () => {
    const { result, rerender } = renderHook(({ n }) => useAsyncValue(n, slowEcho), {
      initialProps: { n: 5 },
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'done', value: 5 }));
    rerender({ n: 60 });
    expect(result.current).toEqual({ status: 'done', value: 5 });
    rerender({ n: 10 });
    await waitFor(() => expect(result.current).toEqual({ status: 'done', value: 10 }));
    await new Promise((r) => setTimeout(r, 80));
    expect(result.current).toEqual({ status: 'done', value: 10 });
  });
});
