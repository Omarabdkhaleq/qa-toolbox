import { describe, expect, it } from 'vitest';
import { FileReadError, readFileAsText } from './file';

describe('readFileAsText', () => {
  it('reads text and strips a BOM (Review Focus 2)', async () => {
    expect(await readFileAsText(new Blob(['﻿{"a":1}']))).toBe('{"a":1}');
  });

  it('rejects files over the size limit', async () => {
    await expect(readFileAsText(new Blob(['12345']), 4)).rejects.toThrow(
      'File is too large (5 B). The limit is 4 B.',
    );
  });

  it('rejects binary files (Review Focus 2)', async () => {
    const binary = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x1a])]);
    await expect(readFileAsText(binary)).rejects.toBeInstanceOf(FileReadError);
    await expect(readFileAsText(binary)).rejects.toThrow('binary file');
  });
});
