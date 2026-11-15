export class ClipboardUnavailableError extends Error {
  constructor() {
    super('Clipboard is unavailable here. Select the text and copy it manually.');
    this.name = 'ClipboardUnavailableError';
  }
}

/** navigator.clipboard only exists in secure contexts; http://<LAN-IP> needs the execCommand fallback. */
export async function copyToClipboard(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document.execCommand !== 'function') throw new ClipboardUnavailableError();
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new ClipboardUnavailableError();
  } finally {
    textarea.remove();
  }
}
