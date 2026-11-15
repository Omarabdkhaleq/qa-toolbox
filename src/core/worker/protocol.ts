export type WorkerResponse<O> = { ok: true; result: O } | { ok: false; error: string };
