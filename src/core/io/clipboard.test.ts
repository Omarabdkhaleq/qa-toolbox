import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipboardUnavailableError, copyToClipboard } from './clipboard';

function setContext(secure: boolean, writeText?: (t: string) => Promise<void>) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}
const setExecCommand = (fn: unknown) =>
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true });

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setExecCommand(undefined);
  });

  it('uses the async clipboard in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setContext(true, writeText);
    await copyToClipboard('hi');
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('falls back to execCommand over plain http on a LAN IP (Review Focus 3)', async () => {
    setContext(false);
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);
    await copyToClipboard('hi');
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('throws a helpful error when no clipboard path works', async () => {
    setContext(false);
    setExecCommand(vi.fn().mockReturnValue(false));
    await expect(copyToClipboard('hi')).rejects.toBeInstanceOf(ClipboardUnavailableError);
    setExecCommand(undefined);
    await expect(copyToClipboard('hi')).rejects.toThrow('Clipboard is unavailable here');
  });
});
