import { useEffect, useState } from 'react';
import { isAbortError } from '../worker/runInWorker';

export type AsyncState<T> =
  { status: 'pending' } | { status: 'done'; value: T } | { status: 'error'; error: Error };

/** `compute` must be stable (defined at module level), or every render restarts it. */
export function useAsyncValue<I, O>(
  input: I,
  compute: (input: I, signal: AbortSignal) => Promise<O>,
): AsyncState<O> {
  const [state, setState] = useState<AsyncState<O>>({ status: 'pending' });

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'done' ? prev : { status: 'pending' }));
    compute(input, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ status: 'done', value });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );
    return () => controller.abort();
  }, [input, compute]);

  return state;
}
