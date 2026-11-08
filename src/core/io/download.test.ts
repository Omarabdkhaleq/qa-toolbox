import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';

describe('downloadText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clicks a temporary link to a blob URL and revokes it', () => {
    vi.useFakeTimers();
    const create = vi.fn().mockReturnValue('blob:devbox/1');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('data.json');
      expect(this.href).toBe('blob:devbox/1');
    });

    downloadText('data.json', '{"a":1}');

    expect(click).toHaveBeenCalledOnce();
    expect((create.mock.calls[0]![0] as Blob).type).toBe('application/json;charset=utf-8');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:devbox/1');
  });
});
