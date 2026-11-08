import { describe, expect, it } from 'vitest';
import { exposeWorker, type WorkerScope } from './expose';

const scope = () => {
  const posted: unknown[] = [];
  const s: WorkerScope = { onmessage: null, postMessage: (m: unknown) => void posted.push(m) };
  return { s, posted };
};

describe('exposeWorker', () => {
  it('posts the result of async functions', async () => {
    const { s, posted } = scope();
    exposeWorker((n: number) => Promise.resolve(n + 1), s);
    await s.onmessage!({ data: 1 } as MessageEvent);
    expect(posted).toEqual([{ ok: true, result: 2 }]);
  });

  it('posts thrown errors as messages', async () => {
    const { s, posted } = scope();
    exposeWorker(() => {
      throw new Error('nope');
    }, s);
    await s.onmessage!({ data: null } as MessageEvent);
    expect(posted).toEqual([{ ok: false, error: 'nope' }]);
  });
});
