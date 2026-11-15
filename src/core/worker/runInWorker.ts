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

type ParsedResponse<O> = { ok: true; result: O } | { ok: false; error: Error };

/** Reads the fields up front so a malformed message rejects instead of throwing mid-settle. */
function parseResponse<O>(data: unknown): ParsedResponse<O> {
  if (typeof data === 'object' && data !== null) {
    const { ok, result, error } = data as Partial<Record<'ok' | 'result' | 'error', unknown>>;
    if (ok === true) return { ok: true, result: result as O };
    if (ok === false && typeof error === 'string') return { ok: false, error: new Error(error) };
  }
  return { ok: false, error: new Error('Malformed worker response') };
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

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = parseResponse<O>(event.data);
      finish(() => (response.ok ? resolve(response.result) : reject(response.error)));
    };
    worker.onmessageerror = () => {
      finish(() => reject(new Error('Worker message could not be deserialized')));
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || 'Worker failed')));
    };
    try {
      worker.postMessage(input);
    } catch (err) {
      finish(() => reject(err));
    }
  });
}
