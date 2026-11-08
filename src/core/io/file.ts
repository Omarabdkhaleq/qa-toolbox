import { formatBytes, stripBom } from '../text';

export const DEFAULT_MAX_FILE_BYTES = 200 * 1024 * 1024;
const BINARY_SNIFF_CHARS = 8192;

export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReadError';
  }
}

export async function readFileAsText(
  file: Blob,
  maxBytes = DEFAULT_MAX_FILE_BYTES,
): Promise<string> {
  if (file.size > maxBytes) {
    throw new FileReadError(
      `File is too large (${formatBytes(file.size)}). The limit is ${formatBytes(maxBytes)}.`,
    );
  }
  const text = await file.text();
  if (text.slice(0, BINARY_SNIFF_CHARS).includes('\u0000')) {
    throw new FileReadError('This looks like a binary file, not text.');
  }
  return stripBom(text);
}
