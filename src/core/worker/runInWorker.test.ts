import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortError, runInWorker, WorkerTimeoutError } from './runInWorker';

type Reply = (input: unknown) => unknown;
const SILENCE = Symbol('silence');
const CRASH = Symbol('crash');

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private reply: Reply) {}
  postMessage(input: unknown) {
    setTimeout(() => {
      const r = this.reply(input);
      if (r === SILENCE) return;
      if (r === CRASH) {
        this.onerror?.({ message: 'worker exploded', preventDefault() {} } as ErrorEvent);
        return;
      }
      this.onmessage?.({ data: r } as MessageEvent);
    }, 10);
  }
  terminate() {
    this.terminated = true;
  }
}

const spawn = (reply: Reply) => {
  const worker = new FakeWorker(reply);
  return { worker, create: () => worker as unknown as Worker };
};

describe('runInWorker', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves the result and terminates the worker', async () => {
    const { worker, create } = spawn((n) => ({ ok: true, result: (n as number) * 2 }));
    await expect(runInWorker<number, number>(create, 21)).resolves.toBe(42);
    expect(worker.terminated).toBe(true);
  });

  it('rejects with the worker error message', async () => {
    const { create } = spawn(() => ({ ok: false, error: 'bad input' }));
    await expect(runInWorker(create, 1)).rejects.toThrow('bad input');
  });

  it('rejects when the worker crashes', async () => {
    const { worker, create } = spawn(() => CRASH);
    await expect(runInWorker(create, 1)).rejects.toThrow('worker exploded');
    expect(worker.terminated).toBe(true);
  });

  it('times out', async () => {
    vi.useFakeTimers();
    const { worker, create } = spawn(() => SILENCE);
    const promise = runInWorker(create, 1, { timeoutMs: 1000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(WorkerTimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(worker.terminated).toBe(true);
  });

  it('aborts during the run, and refuses to start when already aborted', async () => {
    const controller = new AbortController();
    const { worker, create } = spawn(() => SILENCE);
    const promise = runInWorker(create, 1, { signal: controller.signal });
    controller.abort();
    expect(isAbortError(await promise.catch((e: unknown) => e))).toBe(true);
    expect(worker.terminated).toBe(true);

    const neverCreated = vi.fn();
    const already = await runInWorker(neverCreated, 1, { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    expect(isAbortError(already)).toBe(true);
    expect(neverCreated).not.toHaveBeenCalled();
  });
});
