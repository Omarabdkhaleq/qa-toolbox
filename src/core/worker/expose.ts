import type { WorkerResponse } from './protocol';

export interface WorkerScope {
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null;
  postMessage(message: unknown): void;
}

export function exposeWorker<I, O>(
  fn: (input: I) => O | Promise<O>,
  scope: WorkerScope = self as unknown as WorkerScope,
): void {
  scope.onmessage = async (event: MessageEvent<I>) => {
    let response: WorkerResponse<O>;
    try {
      response = { ok: true, result: await fn(event.data) };
    } catch (err) {
      response = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    scope.postMessage(response);
  };
}
