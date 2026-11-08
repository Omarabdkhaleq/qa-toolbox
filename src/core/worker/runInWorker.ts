import type { WorkerResponse } from './protocol';

/** Inputs above this size are processed off the main thread. */
export const WORKER_THRESHOLD_CHARS = 1_000_000;

export interface RunInWorkerOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class WorkerTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms / 1000}s`);
    this.name = 'WorkerTimeoutError';
  }
}

const abortError = () => new DOMException('Aborted', 'AbortError');

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function runInWorker<I, O>(
  createWorker: () => Worker,
  input: I,
  { timeoutMs = 30_000, signal }: RunInWorkerOptions = {},
): Promise<O> {
  return new Promise<O>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const worker = createWorker();
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      settle();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timer = setTimeout(
      () => finish(() => reject(new WorkerTimeoutError(timeoutMs))),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerResponse<O>>) => {
      const data = event.data;
      finish(() => (data.ok ? resolve(data.result) : reject(new Error(data.error))));
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || 'Worker failed')));
    };
    worker.postMessage(input);
  });
}
